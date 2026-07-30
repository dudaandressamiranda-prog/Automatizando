/**
 * Recupera o código de barras de produtos que estão sem ele, cruzando com
 * uma planilha que tenha GTIN (a do painel do admin costuma ter muito mais
 * EAN preenchido do que o ERP).
 *
 * O casamento ignora pontuação e ordem, mas exige o MESMO conjunto de
 * palavras nos dois nomes — "AREIA BIODEGRADAVEL GROSSA 2kg" casa com
 * "AREIA BIODEGRADAVEL GROSSA - 2KG", e é só isso que queremos.
 *
 * Não basta "todas as palavras do catálogo aparecem na planilha": o nome
 * genérico "MORDEDOR SUPER BOWL LED" está contido em "MORDEDOR SUPER BOWL
 * LED - Rosa", e herdar o EAN da versão rosa seria informação errada. Por
 * isso qualquer palavra sobrando na planilha (cor, dose, sabor) reprova o
 * casamento — esses ficam para conferência manual.
 *
 * A contagem de repetições importa: "…Dogritos e Lazy Dog - Lazy Dog" e
 * "…Dogritos e Lazy Dog - Dogritos" usam as mesmas palavras e são produtos
 * diferentes; só a quantidade de cada uma os separa.
 *
 * Segunda trava: só atribui quando o casamento aponta para UM único EAN.
 * Nome que casa com códigos diferentes é cadastro "pai" com variações
 * (ex.: NexGard 4,1-10kg existe em 1 e em 3 comprimidos) — não mexe.
 *
 * Uso:
 *   npm run recuperar-ean -- planilha.xlsx            # só relatório
 *   npm run recuperar-ean -- planilha.xlsx --apply    # grava os seguros
 */
import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';
import { detectColumns } from './lib/columns.js';
import { cleanBarcode, norm } from './lib/normalize.js';
import { readSpreadsheet } from './lib/parse.js';

/** Nome curto demais casa com meio catálogo — exige um mínimo de palavras. */
const MIN_TOKENS = 3;

const tokens = (s: string) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);

type Prod = { id: string; name: string; barcode: string | null; status: string };

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) throw new Error('Informe a planilha: npm run recuperar-ean -- planilha.xlsx');

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.');
  const db = createClient(url, key, { auth: { persistSession: false } });

  console.log(`Lendo ${file}...`);
  const { headers, records } = await readSpreadsheet(file);
  const { map } = detectColumns(headers);
  if (!map.name || !map.barcode) {
    throw new Error(`Planilha precisa de coluna de nome e de GTIN. Cabeçalhos: ${headers.join(', ')}`);
  }
  const cell = (r: Record<string, unknown>, c?: string) =>
    c && r[c] != null ? String(r[c]).trim() : '';

  const linhas: { assinatura: string; ean: string; nome: string }[] = [];
  for (const r of records) {
    const nome = cell(r, map.name);
    const bc = cleanBarcode(cell(r, map.barcode) || null);
    if (nome && bc.ok && bc.value) {
      linhas.push({ assinatura: tokens(nome).sort().join(' '), ean: bc.value, nome });
    }
  }
  console.log(`  ${linhas.length} linhas com GTIN válido.`);

  console.log('Consultando o catálogo...');
  const prods: Prod[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('products')
      .select('id, name, barcode, status')
      .order('id')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    prods.push(...((data ?? []) as Prod[]));
    if (!data || data.length < 1000) break;
  }
  const jaUsados = new Set(prods.map((p) => p.barcode).filter(Boolean) as string[]);
  const semEan = prods.filter((p) => !p.barcode);
  console.log(`  ${semEan.length} produtos sem código.`);

  const seguros: { id: string; nome: string; ean: string; naPlanilha: string }[] = [];
  const variacoes: { nome: string; eans: number; exemplos: string }[] = [];
  let curto = 0;
  let semMatch = 0;
  let eanDeOutro = 0;

  for (const p of semEan) {
    const t = tokens(p.name);
    if (t.length < MIN_TOKENS) {
      curto++;
      continue;
    }
    const assinatura = [...t].sort().join(' ');
    const hits = linhas.filter((l) => l.assinatura === assinatura);
    if (hits.length === 0) {
      semMatch++;
      continue;
    }
    const eans = [...new Set(hits.map((h) => h.ean))];
    if (eans.length > 1) {
      variacoes.push({
        nome: p.name,
        eans: eans.length,
        exemplos: hits.slice(0, 3).map((h) => h.nome).join(' | '),
      });
      continue;
    }
    const ean = eans[0]!;
    if (jaUsados.has(ean)) {
      eanDeOutro++;
      continue;
    }
    seguros.push({ id: p.id, nome: p.name, ean, naPlanilha: hits[0]!.nome });
    jaUsados.add(ean); // não deixa dois produtos disputarem o mesmo código
  }

  console.log('');
  console.log(`Recuperáveis com segurança (um único EAN): ${seguros.length}`);
  console.log(`Cadastro "pai" com variações (não mexe):    ${variacoes.length}`);
  console.log(`EAN já pertence a outro produto:            ${eanDeOutro}`);
  console.log(`Sem correspondência na planilha:            ${semMatch}`);
  console.log(`Nome curto demais para casar com segurança: ${curto}`);

  await writeFile(
    'recuperar-ean.csv',
    '﻿' + Papa.unparse(seguros.map((s) => ({ nome_catalogo: s.nome, ean: s.ean, nome_planilha: s.naPlanilha })), { delimiter: ';' }),
    'utf8',
  );
  await writeFile(
    'recuperar-ean-variacoes.csv',
    '﻿' + Papa.unparse(variacoes, { delimiter: ';' }),
    'utf8',
  );
  console.log('\nRelatórios: recuperar-ean.csv e recuperar-ean-variacoes.csv');

  if (!apply) {
    console.log('Nada foi gravado. Rode com --apply para atribuir os códigos seguros.');
    return;
  }
  for (const s of seguros) {
    const { error } = await db.from('products').update({ barcode: s.ean }).eq('id', s.id);
    if (error) throw new Error(`Erro em "${s.nome}": ${error.message}`);
  }
  console.log(`\n✅ ${seguros.length} códigos atribuídos.`);
  console.log('Rode "npm run regras -- --reativar --apply" para devolvê-los à vitrine.');
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
