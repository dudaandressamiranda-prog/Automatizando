/**
 * Faz valer a regra do catálogo: produto só fica ATIVO com cadastro
 * completo — foto E código de barras. Quem estiver ativo sem um dos dois
 * é desativado, some da vitrine e vai parar em "A revisar" no app, onde dá
 * para completar o cadastro e reativar.
 *
 * Nada é apagado: só muda o status, e a lista do que mudou fica em CSV.
 *
 * Uso:
 *   npm run regras            # só lista o que está irregular
 *   npm run regras -- --apply # desativa (com backup em regras-desativados.csv)
 */
import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';

type Prod = {
  id: string;
  name: string;
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
      .select('id, name, barcode, photo_path, photo_source_url, status')
      .order('id')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    prods.push(...((data ?? []) as Prod[]));
    if (!data || data.length < 1000) break;
  }

  const ativos = prods.filter((p) => p.status === 'ativo');
  const semFoto = (p: Prod) => !p.photo_path && !p.photo_source_url;
  const semEan = (p: Prod) => !p.barcode;
  const irregulares = ativos.filter((p) => semFoto(p) || semEan(p));

  const motivo = (p: Prod) =>
    semFoto(p) && semEan(p) ? 'sem foto e sem código' : semFoto(p) ? 'sem foto' : 'sem código';

  console.log(`Ativos: ${ativos.length}`);
  console.log(`Irregulares: ${irregulares.length}`);
  console.log(`  sem foto:              ${ativos.filter((p) => semFoto(p) && !semEan(p)).length}`);
  console.log(`  sem código:            ${ativos.filter((p) => semEan(p) && !semFoto(p)).length}`);
  console.log(`  sem foto e sem código: ${ativos.filter((p) => semFoto(p) && semEan(p)).length}`);

  if (irregulares.length === 0) {
    console.log('\n✅ Catálogo em dia — todo produto ativo tem foto e código.');
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
