/**
 * Robô de fotos: para produtos da planilha que estão SEM foto e FORA do
 * catálogo, procura a foto na internet pelo código de barras (APIs de
 * catálogo de grandes pet shops — plataforma VTEX) e, com --apply,
 * importa os produtos já com a foto encontrada, passando por todas as
 * regras do importador (sem kits, sem duplicatas, foto obrigatória).
 *
 * Uso:
 *   npm run fotos -- caminho/da/planilha.csv           # só procura e lista
 *   npm run fotos -- caminho/da/planilha.csv --apply   # importa o que achou
 *
 * O que o robô NÃO acha (produto antigo, sem EAN, apresentação fora de
 * linha) continua no relatório de faltantes — esses casos se resolvem
 * com busca assistida (pedir ao Claude na sessão) ou foto manual no app.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { applyPlan, fetchExisting } from './lib/apply.js';
import { isIgnorado, loadIgnorados } from './lib/ignorados.js';
import { parseFile } from './lib/parse.js';
import { buildPlan } from './lib/plan.js';
import { SHOPS, type Hit, sleep, vtexByEan } from './lib/fotoweb.js';

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const sourceArg = args.find((a) => a.startsWith('--source='));
  const source = sourceArg ? sourceArg.slice('--source='.length) : 'erp';
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) throw new Error('Informe o arquivo: npm run fotos -- planilha.csv [--apply]');

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env (veja .env.example).');
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  console.log(`Lendo ${file}...`);
  const parsed = await parseFile(file); // já aplica as regras de kit/situação

  console.log('Consultando o catálogo...');
  const existing = await fetchExisting(db);
  const inCatalogBarcodes = new Set(existing.products.map((p) => p.barcode).filter(Boolean));
  const inCatalogIds = new Set(existing.products.map((p) => p.external_id).filter(Boolean));

  // Alvo: ativo (ou sem situação), COM estoque em alguma loja, sem foto na
  // planilha, com EAN, fora do catálogo. O filtro de estoque acompanha a
  // regra do importador — sem ele o robô gastaria horas procurando foto de
  // cadastro parado, que seria recusado na hora de gravar.
  const ignorados = loadIgnorados();
  const alvo = parsed.rows.filter(
    (r) =>
      !isIgnorado(ignorados, r) &&
      (!r.status || r.status === 'ativo') &&
      !(r.stock !== null && r.stock <= 0) &&
      !r.photoUrl &&
      r.barcode &&
      !inCatalogBarcodes.has(r.barcode) &&
      !(r.externalId && inCatalogIds.has(r.externalId)),
  );
  console.log(`${alvo.length} produtos ativos sem foto e fora do catálogo. Procurando...`);

  let achou = 0;
  for (const row of alvo) {
    let hit: Hit | null = null;
    for (const shop of SHOPS) {
      hit = await vtexByEan(shop, row.barcode!);
      if (hit) break;
      await sleep(400);
    }
    if (hit) {
      row.photoUrl = hit.image;
      // nome não deu pista de categoria? usa a que a loja usa para esse EAN
      if (!row.category && hit.storeCategory) row.category = hit.storeCategory;
      achou++;
      console.log(`  ✓ ${row.name.slice(0, 45).padEnd(47)} [${hit.shop}] "${hit.storeName.slice(0, 40)}"`);
    } else {
      console.log(`  ✗ ${row.name.slice(0, 45)}`);
    }
    await sleep(600); // educação com as lojas
  }
  console.log(`\nFotos encontradas: ${achou} de ${alvo.length}`);
  if (achou === 0) return;

  // importa SÓ as linhas que ganharam foto, com todas as regras do plano
  const comFoto = alvo.filter((r) => r.photoUrl);
  const plan = buildPlan(comFoto, existing.products, existing.categories, source);
  console.log(`\nPlano (${apply ? 'APLICANDO' : 'simulação — use --apply para gravar'}):`);
  console.log(`  Produtos novos: ${plan.inserts.length} | Categorias novas: ${plan.newCategories.length}`);
  for (const w of plan.warnings) console.log(`  ⚠ ${w}`);

  if (!apply) {
    console.log('\nNada foi gravado. Rode de novo com --apply para importar com as fotos.');
    return;
  }
  await applyPlan(db, plan, existing.categories);
  console.log('\n✅ Produtos importados com foto.');
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
