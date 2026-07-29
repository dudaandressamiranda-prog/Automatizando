/**
 * Importa a planilha exportada do painel admin para o Catálogo de Produtos.
 *
 * Uso:
 *   npm run import -- caminho/da/planilha.csv            # simula (dry-run, padrão)
 *   npm run import -- caminho/da/planilha.xlsx --apply   # grava de verdade
 *
 * Opções:
 *   --apply              grava no banco (sem isso, só mostra o que faria)
 *   --source=site_admin  origem dos registros (padrão: site_admin)
 *   --map campo="Coluna" força o mapeamento de uma coluna
 *                        (campos: name, barcode, brand, supplier, category,
 *                         externalId, externalUrl)
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { applyPlan, fetchExisting } from './lib/apply.js';
import type { ColumnMap, Field } from './lib/columns.js';
import { parseFile } from './lib/parse.js';
import { buildPlan } from './lib/plan.js';

const VALID_FIELDS: Field[] = ['name', 'barcode', 'brand', 'supplier', 'category', 'externalId', 'externalUrl'];
const VALID_SOURCES = ['site_admin', 'pdf_fornecedor', 'erp', 'manual'];

function parseArgs(argv: string[]) {
  let file: string | undefined;
  let apply = false;
  let source = 'site_admin';
  const overrides: ColumnMap = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--apply') apply = true;
    else if (arg.startsWith('--source=')) source = arg.slice('--source='.length);
    else if (arg === '--map') {
      const pair = argv[++i];
      const m = pair?.match(/^([a-zA-Z]+)=(.+)$/);
      if (!m) throw new Error(`--map espera campo="Coluna", recebi: ${pair}`);
      const field = m[1] as Field;
      if (!VALID_FIELDS.includes(field)) {
        throw new Error(`Campo "${field}" inválido em --map. Válidos: ${VALID_FIELDS.join(', ')}`);
      }
      overrides[field] = m[2]!;
    } else if (!arg.startsWith('--')) file = arg;
    else throw new Error(`Opção desconhecida: ${arg}`);
  }

  if (!file) throw new Error('Informe o arquivo: npm run import -- planilha.csv [--apply]');
  if (!VALID_SOURCES.includes(source)) {
    throw new Error(`--source inválido: ${source}. Válidos: ${VALID_SOURCES.join(', ')}`);
  }
  return { file, apply, source, overrides };
}

async function main() {
  const { file, apply, source, overrides } = parseArgs(process.argv.slice(2));

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env (veja .env.example).');
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  console.log(`Lendo ${file}...`);
  const parsed = await parseFile(file, overrides);
  console.log(`  ${parsed.rows.length} linhas válidas.`);
  console.log(`  Colunas reconhecidas: ${Object.entries(parsed.columnMap).map(([f, c]) => `${f}="${c}"`).join(', ')}`);
  if (parsed.unmatchedHeaders.length > 0) {
    console.log(`  Colunas ignoradas: ${parsed.unmatchedHeaders.join(', ')}`);
  }

  console.log('Consultando base atual...');
  const existing = await fetchExisting(db);
  console.log(`  ${existing.products.length} produtos e ${existing.categories.length} categorias no banco.`);

  const plan = buildPlan(parsed.rows, existing.products, existing.categories, source);

  console.log('');
  console.log(`Plano (${apply ? 'APLICANDO' : 'simulação — use --apply para gravar'}):`);
  console.log(`  Categorias novas:      ${plan.newCategories.length}${plan.newCategories.length ? ` (${plan.newCategories.join(', ')})` : ''}`);
  console.log(`  Produtos novos:        ${plan.inserts.length}`);
  console.log(`  Produtos atualizados:  ${plan.updates.length}`);
  console.log(`  Sem mudança:           ${plan.unchanged}`);

  const allWarnings = [...parsed.warnings, ...plan.warnings];
  if (allWarnings.length > 0) {
    console.log(`\nAvisos (${allWarnings.length}):`);
    for (const w of allWarnings) console.log(`  ⚠ ${w}`);
  }

  if (!apply) {
    console.log('\nNada foi gravado. Rode de novo com --apply para executar o plano.');
    return;
  }

  await applyPlan(db, plan, existing.categories);
  console.log('\n✅ Importação concluída.');
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
