/**
 * Arruma a categoria Medicamentos: cria as subcategorias por tipo de
 * tratamento e devolve para casa o que nunca foi remédio (ração clínica,
 * curativo, casco bovino, shampoo de tratamento).
 *
 * A regra de classificação está em lib/medcat.ts. O que ela não souber
 * classificar fica em "Medicamentos" mesmo — nada é chutado.
 *
 * Uso:
 *   npm run medicamentos            # relatório, não altera nada
 *   npm run medicamentos -- --apply # cria as subcategorias e move
 */
import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';
import { classifyMedicamento } from './lib/medcat.js';
import { norm } from './lib/normalize.js';

type Prod = { id: string; name: string; status: string; category_id: string | null };

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.');
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: cats, error: ce } = await db.from('categories').select('id, name');
  if (ce) throw new Error(ce.message);
  const idPorNome = new Map((cats ?? []).map((c) => [norm(c.name), c.id]));

  const medIds = (cats ?? []).filter((c) => norm(c.name).startsWith('medicamentos')).map((c) => c.id);
  if (medIds.length === 0) throw new Error('Categoria "Medicamentos" não existe.');

  const prods: Prod[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('products')
      .select('id, name, status, category_id')
      .in('category_id', medIds)
      .order('name')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    prods.push(...((data ?? []) as Prod[]));
    if (!data || data.length < 1000) break;
  }
  console.log(`Produtos hoje em Medicamentos: ${prods.length}`);

  const destino = new Map<string, Prod[]>();
  const semClassificacao: Prod[] = [];
  for (const p of prods) {
    const r = classifyMedicamento(p.name);
    if (!r) {
      semClassificacao.push(p);
      continue;
    }
    const lista = destino.get(r.categoria) ?? [];
    lista.push(p);
    destino.set(r.categoria, lista);
  }

  const subs = [...destino.entries()].filter(([c]) => c.startsWith('Medicamentos >')).sort((a, b) => b[1].length - a[1].length);
  const saem = [...destino.entries()].filter(([c]) => !c.startsWith('Medicamentos >')).sort((a, b) => b[1].length - a[1].length);

  console.log('\n── Subcategorias de Medicamentos ─────────────────');
  for (const [c, lista] of subs) console.log(`  ${String(lista.length).padStart(4)}  ${c.replace('Medicamentos > ', '')}`);
  console.log(`  ${String(semClassificacao.length).padStart(4)}  (fica em Medicamentos, sem subcategoria)`);

  console.log('\n── Sai de Medicamentos ───────────────────────────');
  for (const [c, lista] of saem) {
    console.log(`  ${String(lista.length).padStart(4)}  → ${c}`);
    for (const p of lista.slice(0, 4)) console.log(`         ${p.name.slice(0, 62)}`);
    if (lista.length > 4) console.log(`         … mais ${lista.length - 4}`);
  }

  // relatório completo para conferência
  const linhas = [...destino.entries()].flatMap(([c, lista]) =>
    lista.map((p) => ({ produto: p.name, de: 'Medicamentos', para: c })),
  );
  await writeFile('medicamentos.csv', '﻿' + Papa.unparse(linhas, { delimiter: ';' }), 'utf8');
  await writeFile(
    'medicamentos-sem-classificacao.csv',
    '﻿' + Papa.unparse(semClassificacao.map((p) => ({ produto: p.name })), { delimiter: ';' }),
    'utf8',
  );
  console.log('\nRelatórios: medicamentos.csv e medicamentos-sem-classificacao.csv');

  if (!apply) {
    console.log('Nada foi alterado. Rode com --apply para criar as subcategorias e mover.');
    return;
  }

  // cria as categorias que ainda não existem
  const faltando = [...destino.keys()].filter((c) => !idPorNome.has(norm(c)));
  if (faltando.length > 0) {
    const { data, error } = await db.from('categories').insert(faltando.map((name) => ({ name }))).select('id, name');
    if (error) throw new Error(`Erro criando categorias: ${error.message}`);
    for (const c of data ?? []) idPorNome.set(norm(c.name), c.id);
    console.log(`\nCategorias criadas: ${faltando.length}`);
  }

  let movidos = 0;
  for (const [categoria, lista] of destino) {
    const catId = idPorNome.get(norm(categoria));
    if (!catId) throw new Error(`Categoria "${categoria}" não foi criada.`);
    const ids = lista.map((p) => p.id);
    for (let i = 0; i < ids.length; i += 80) {
      const { error } = await db.from('products').update({ category_id: catId }).in('id', ids.slice(i, i + 80));
      if (error) throw new Error(error.message);
      movidos += Math.min(80, ids.length - i);
    }
  }
  console.log(`\n✅ ${movidos} produtos recategorizados.`);
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
