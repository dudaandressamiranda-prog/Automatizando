/**
 * Faz valer a regra do catálogo: produto ATIVO precisa ter FOTO. Sem foto
 * ninguém reconhece o item na tela, então ele é desativado, some da vitrine
 * e vai parar em "A revisar" no app, onde dá para completar o cadastro.
 *
 * O código de barras é desejável, mas não derruba o produto: muito item que
 * gira nas lojas ainda não tem EAN no cadastro, e tirá-lo da vitrine
 * atrapalha mais do que ajuda. Para exigir o EAN também, use `--exigir-ean`.
 *
 * Nada é apagado: só muda o status, e a lista do que mudou fica em CSV.
 *
 * O caminho de volta é o `--reativar`: quem ESTE script desativou e depois
 * regularizou volta para a vitrine. A lista de quem voltou a ser elegível
 * sai do próprio regras-desativados.csv, de propósito — produto desativado
 * por outro motivo (inativo no ERP, decisão manual na tela de categorização)
 * não pode ser revertido por engano.
 *
 * Uso:
 *   npm run regras                    # só lista o que está irregular
 *   npm run regras -- --apply         # desativa (backup em .csv)
 *   npm run regras -- --exigir-ean    # regra estrita: exige foto E código
 *   npm run regras -- --reativar      # reativa quem regularizou
 */
import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';

type Prod = {
  id: string;
  name: string;
  status_manual: boolean;
  barcode: string | null;
  photo_path: string | null;
  photo_source_url: string | null;
  status: string;
};

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.');
  const db = createClient(url, key, { auth: { persistSession: false } });

  const prods: Prod[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('products')
      .select('id, name, barcode, photo_path, photo_source_url, status, status_manual')
      .order('id')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    prods.push(...((data ?? []) as Prod[]));
    if (!data || data.length < 1000) break;
  }

  const exigirEan = process.argv.includes('--exigir-ean');
  const ativos = prods.filter((p) => p.status === 'ativo');
  const semFoto = (p: Prod) => !p.photo_path && !p.photo_source_url;
  const semEan = (p: Prod) => !p.barcode;
  const irregular = (p: Prod) => semFoto(p) || (exigirEan && semEan(p));
  // Quem foi ativado na mão fica de fora: a decisão é de quem olhou o
  // produto, e não cabe ao script desfazê-la.
  const irregulares = ativos.filter((p) => irregular(p) && !p.status_manual);
  const travados = ativos.filter((p) => irregular(p) && p.status_manual).length;

  // --reativar: desfaz a própria desativação quando o cadastro se completou.
  // Só considera quem está no regras-desativados.csv — produto desativado por
  // outro motivo (inativo no ERP, decisão manual na tela) não é revertido.
  if (process.argv.includes('--reativar')) {
    let desativadosPorAqui: Set<string>;
    try {
      const csv = await readFile('regras-desativados.csv', 'utf8');
      const parsed = Papa.parse<{ id: string }>(csv.replace(/^﻿/, ''), {
        header: true,
        delimiter: ';',
        skipEmptyLines: true,
      });
      desativadosPorAqui = new Set(parsed.data.map((r) => r.id).filter(Boolean));
    } catch {
      throw new Error(
        'Não achei regras-desativados.csv — a reativação só desfaz o que este script desativou.',
      );
    }
    const voltam = prods.filter(
      (p) =>
        p.status === 'desativado' &&
        desativadosPorAqui.has(p.id) &&
        !irregular(p) &&
        !p.status_manual, // desativado na mão depois: continua desativado
    );
    console.log(`Desativados por este script que já regularizaram: ${voltam.length}`);
    for (const p of voltam) console.log(`  ${p.name}`);
    if (voltam.length === 0) return;
    if (!apply) {
      console.log('\nNada foi alterado. Junte --apply para reativar.');
      return;
    }
    const ids = voltam.map((p) => p.id);
    for (let i = 0; i < ids.length; i += 80) {
      const { error } = await db
        .from('products')
        .update({ status: 'ativo' })
        .in('id', ids.slice(i, i + 80));
      if (error) throw new Error(error.message);
    }
    console.log(`\n✅ ${ids.length} produtos reativados.`);
    return;
  }

  const motivo = (p: Prod) =>
    semFoto(p) && semEan(p) ? 'sem foto e sem código' : semFoto(p) ? 'sem foto' : 'sem código';

  console.log(`Regra: produto ativo precisa de foto${exigirEan ? ' E código de barras' : ''}.`);
  console.log(`Ativos: ${ativos.length}`);
  console.log(`A desativar: ${irregulares.length}`);
  console.log(`  sem foto:              ${ativos.filter((p) => semFoto(p) && !semEan(p)).length}`);
  console.log(`  sem foto e sem código: ${ativos.filter((p) => semFoto(p) && semEan(p)).length}`);
  const soSemEan = ativos.filter((p) => semEan(p) && !semFoto(p)).length;
  console.log(
    `  só sem código:         ${soSemEan}` +
      (exigirEan ? '' : ' (mantidos ativos — têm foto; complete o EAN em "A revisar")'),
  );
  if (travados > 0) {
    console.log(`  ativados na mão:       ${travados} (irregulares, mas a decisão é sua — não mexo)`);
  }

  if (irregulares.length === 0) {
    console.log(`\n✅ Catálogo em dia — todo produto ativo tem foto${exigirEan ? ' e código' : ''}.`);
    return;
  }

  const csv = Papa.unparse(
    irregulares.map((p) => ({ id: p.id, nome: p.name, motivo: motivo(p) })),
    { delimiter: ';' },
  );
  await writeFile('regras-desativados.csv', '﻿' + csv, 'utf8');
  console.log('\nLista: regras-desativados.csv');

  if (!apply) {
    console.log('Nada foi alterado. Rode com --apply para desativar.');
    return;
  }

  const ids = irregulares.map((p) => p.id);
  for (let i = 0; i < ids.length; i += 80) {
    const { error } = await db
      .from('products')
      .update({ status: 'desativado' })
      .in('id', ids.slice(i, i + 80));
    if (error) throw new Error(error.message);
  }
  console.log(`\n✅ ${ids.length} produtos desativados — aparecem em "A revisar" no app.`);
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
