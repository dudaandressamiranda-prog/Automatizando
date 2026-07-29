/**
 * Relatório de faltantes: compara a planilha COMPLETA do ERP (com tudo:
 * ativos, inativos, com e sem foto) com o que está no catálogo, e lista
 * o que ficou de fora e por quê. É a lista de trabalho para ir
 * alimentando o catálogo aos poucos.
 *
 * Uso:
 *   npm run faltantes -- caminho/da/planilha.csv
 *
 * Saída: resumo no terminal + arquivo faltantes.csv ao lado da planilha.
 */
import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';
import { detectColumns } from './lib/columns.js';
import { isIgnorado, loadIgnorados } from './lib/ignorados.js';
import { cleanBarcode, norm } from './lib/normalize.js';
import { KIT_NAME, readSpreadsheet } from './lib/parse.js';

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!file) throw new Error('Informe o arquivo: npm run faltantes -- planilha.csv');

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env (veja .env.example).');
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  console.log(`Lendo ${file}...`);
  const { headers, records } = await readSpreadsheet(file);
  const { map } = detectColumns(headers);
  if (!map.name) throw new Error(`Não achei a coluna do nome. Cabeçalhos: ${headers.join(', ')}`);

  console.log('Consultando o catálogo...');
  const inCatalogBarcodes = new Set<string>();
  const inCatalogExternalIds = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('products')
      .select('barcode, external_id')
      .range(from, from + 999);
    if (error) throw new Error(`Erro lendo produtos: ${error.message}`);
    for (const p of data ?? []) {
      if (p.barcode) inCatalogBarcodes.add(p.barcode);
      if (p.external_id) inCatalogExternalIds.add(p.external_id);
    }
    if (!data || data.length < 1000) break;
  }

  const cell = (r: Record<string, unknown>, c: string | undefined): string => {
    if (!c) return '';
    const v = r[c];
    return v === null || v === undefined ? '' : String(v).trim();
  };

  type Falta = {
    Nome: string;
    'Código de barras': string;
    'ID ERP': string;
    Situação: string;
    'Tem foto': string;
    'Por que está fora': string;
  };
  const faltantes: Falta[] = [];
  let presentes = 0;
  let descartados = 0;
  const ignorados = loadIgnorados();

  for (const r of records) {
    const name = cell(r, map.name);
    if (!name) continue;
    const externalId = cell(r, map.externalId);
    const bc = cleanBarcode(cell(r, map.barcode) || null);
    const barcode = bc.ok ? bc.value : null;

    if (isIgnorado(ignorados, { externalId, barcode })) {
      descartados++;
      continue;
    }
    if ((externalId && inCatalogExternalIds.has(externalId)) || (barcode && inCatalogBarcodes.has(barcode))) {
      presentes++;
      continue;
    }

    const kind = cell(r, map.kind);
    const status = norm(cell(r, map.status));
    const photo = cell(r, map.photoUrl);

    const motivos: string[] = [];
    if (norm(kind) === 'k' || KIT_NAME.test(name)) motivos.push('kit/pacote de anúncio');
    if (status && status !== 'ativo') motivos.push(`situação: ${cell(r, map.status)}`);
    if (!photo) motivos.push('sem foto');
    if (motivos.length === 0) motivos.push('apto — entra na próxima importação');

    faltantes.push({
      Nome: name,
      'Código de barras': barcode ?? '',
      'ID ERP': externalId,
      Situação: cell(r, map.status) || '?',
      'Tem foto': photo ? 'sim' : 'não',
      'Por que está fora': motivos.join(' + '),
    });
  }

  // Ordena por prioridade de trabalho: aptos → sem foto ativos → inativos → kits.
  const prioridade = (f: Falta) => {
    const m = f['Por que está fora'];
    if (m.startsWith('apto')) return 0;
    if (m.includes('kit')) return 3;
    if (m.includes('situação')) return 2;
    return 1; // sem foto, ativo
  };
  faltantes.sort((a, b) => prioridade(a) - prioridade(b) || a.Nome.localeCompare(b.Nome, 'pt-BR'));

  const resumo = new Map<string, number>();
  for (const f of faltantes) {
    const k = prioridade(f) === 0 ? 'aptos (entram na próxima importação)'
      : prioridade(f) === 1 ? 'ativos sem foto'
      : prioridade(f) === 2 ? 'inativos/descontinuados'
      : 'kits/pacotes de anúncio';
    resumo.set(k, (resumo.get(k) ?? 0) + 1);
  }

  console.log('');
  console.log(`No catálogo: ${presentes} linhas da planilha já têm produto correspondente.`);
  if (descartados > 0) console.log(`Descartados de vez (ignorados.csv): ${descartados}`);
  console.log(`Fora do catálogo: ${faltantes.length}`);
  for (const [k, n] of resumo) console.log(`  ${k}: ${n}`);

  const out = path.join(path.dirname(file), 'faltantes.csv');
  await writeFile(out, '﻿' + Papa.unparse(faltantes, { delimiter: ';' }), 'utf8');
  console.log(`\nLista completa: ${out} (abre no Excel)`);
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
