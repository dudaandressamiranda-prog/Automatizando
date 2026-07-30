/**
 * Relatório de "pais redundantes": produtos sem código de barras cujo nome
 * é exatamente o começo de variações que JÁ têm código no catálogo.
 *
 * Distingue três casos, para não apagar produto real por engano:
 *  - FORTE: nome genérico puro (sem cor/tamanho/dose) E as variações têm
 *    códigos DIFERENTES entre si → cada variação tem seu EAN, logo o nome
 *    sem código é só um pai supérfluo. Candidato seguro a remover.
 *  - EAN_UNICO: genérico, mas a família toda compartilha um único EAN — é o
 *    caso do fornecedor que usa um código para todas as cores; as versões
 *    sem código são variações REAIS. Não mexer.
 *  - VARIACAO: o próprio nome já traz cor/tamanho/dose — apresentação
 *    específica, provável produto real. Não mexer.
 *
 * Uso:
 *   npm run consolidar            # gera consolidar.csv (não altera nada)
 *   npm run consolidar -- --apply # remove SÓ os FORTE (com backup em .csv)
 */
import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';

const CORES =
  /rosa|azul|verde|vermelh|amarel|pret|branc|cinza|rox|lilas|laranja|marrom|caqui|bordo|marinho|transparente|gliter|glitter|metalizad|neon|pastel|sortid|variad|colorid|caramelo|bege|dourad|prata|degrade/;
const MEDIDA = /\d+\s?(ml|l|kg|g|mg|cm|mm|litro|un|unidades?|comprimidos?|caps|capsulas?|comp|pares?)/;

function noAccent(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
function tokens(s: string): string[] {
  return noAccent(s).split(/[^a-z0-9]+/).filter(Boolean);
}
function temMarcador(nome: string): boolean {
  const n = ` ${noAccent(nome)} `;
  return CORES.test(n) || MEDIDA.test(n) || /\d+\s*a\s*\d+\s*kg/.test(n);
}
function isPrefix(a: string[], b: string[]): boolean {
  return a.length < b.length && a.every((t, i) => t === b[i]);
}
function validEan(bc: string | null): boolean {
  return Boolean(bc) && /^[0-9]{8}$|^[0-9]{12,14}$/.test(bc!);
}

type Prod = { id: string; name: string; barcode: string | null };

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.');
  const db = createClient(url, key, { auth: { persistSession: false } });

  const prods: Prod[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('products').select('id, name, barcode').range(from, from + 999);
    if (error) throw new Error(error.message);
    prods.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const com = prods.filter((p) => validEan(p.barcode)).map((p) => ({ p, t: tokens(p.name) }));
  const sem = prods.filter((p) => !validEan(p.barcode));

  const forte: { pai: Prod; eans: number; variacoes: number; exemplos: string }[] = [];
  const eanUnico: string[] = [];
  const variacao: string[] = [];

  for (const s of sem) {
    const st = tokens(s.name);
    if (st.length < 2) continue;
    const filhos = com.filter((c) => isPrefix(st, c.t)).map((c) => c.p);
    if (filhos.length === 0) continue;
    if (temMarcador(s.name)) {
      variacao.push(s.name);
      continue;
    }
    const eans = new Set(filhos.map((f) => f.barcode)).size;
    if (eans >= 2) {
      forte.push({
        pai: s,
        eans,
        variacoes: filhos.length,
        exemplos: filhos.slice(0, 3).map((f) => f.name).join(' | '),
      });
    } else {
      eanUnico.push(s.name);
    }
  }

  forte.sort((a, b) => b.eans - a.eans);
  console.log(`FORTE (candidatos a remover): ${forte.length}`);
  console.log(`EAN único na família (não mexer): ${eanUnico.length}`);
  console.log(`Variação com cor/tamanho (não mexer): ${variacao.length}`);

  const csv = Papa.unparse(
    forte.map((f) => ({
      nome_pai: f.pai.name,
      eans_distintos: f.eans,
      variacoes: f.variacoes,
      exemplos_com_codigo: f.exemplos,
    })),
    { delimiter: ';' },
  );
  await writeFile('consolidar.csv', '﻿' + csv, 'utf8');
  console.log('\nRelatório: consolidar.csv (confira antes de --apply)');

  if (!apply) {
    console.log('Nada foi removido. Rode com --apply para remover os FORTE.');
    return;
  }
  const ids = forte.map((f) => f.pai.id);
  await writeFile(
    'consolidar-removidos.csv',
    '﻿' + Papa.unparse(forte.map((f) => ({ id: f.pai.id, nome: f.pai.name })), { delimiter: ';' }),
    'utf8',
  );
  for (let i = 0; i < ids.length; i += 80) {
    const { error } = await db.from('products').delete().in('id', ids.slice(i, i + 80));
    if (error) throw new Error(error.message);
  }
  console.log(`\n✅ ${ids.length} pais removidos (backup em consolidar-removidos.csv).`);
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
