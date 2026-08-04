/**
 * Procura foto para os produtos que já estão no catálogo sem ela.
 *
 * O robô `fotos` trabalha em cima da planilha, antes do produto existir.
 * Este trabalha depois: varre quem já está cadastrado, tem código de barras
 * e continua sem foto — a fila da tela "A completar" — e tenta preencher.
 *
 * Só grava a foto. Não ativa nada: a regra de que produto sem foto fica
 * fora da vitrine é sua, e ativar é decisão de quem confere.
 *
 * Uso:
 *   npm run fotos-pendentes            # procura e grava o que achar
 *   npm run fotos-pendentes -- --dry   # só mostra, não grava
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { buscarFoto, sleep } from './lib/fotoweb.js';

interface Pendente {
  id: string;
  name: string;
  barcode: string;
}

async function main() {
  const dry = process.argv.includes('--dry');

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.');
  const db = createClient(url, key, { auth: { persistSession: false } });

  console.log('Consultando o catálogo...');
  const alvos: Pendente[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('products')
      .select('id, name, barcode')
      .is('photo_path', null)
      .is('photo_source_url', null)
      .not('barcode', 'is', null)
      .order('id')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    alvos.push(...((data ?? []) as Pendente[]));
    if (!data || data.length < 1000) break;
  }
  console.log(`${alvos.length} produtos sem foto e com código de barras.`);
  if (alvos.length === 0) return;

  const minutos = Math.round((alvos.length * 1.4) / 60);
  console.log(`Procurando nas lojas (leva uns ${minutos} min)...\n`);

  let achou = 0;
  let gravou = 0;
  for (const [n, p] of alvos.entries()) {
    const hit = await buscarFoto(p.barcode);
    if (hit) {
      achou++;
      console.log(`  ✓ ${p.name.slice(0, 44).padEnd(46)} [${hit.shop}]`);
      if (!dry) {
        const { error } = await db
          .from('products')
          .update({ photo_source_url: hit.image, photo_updated_at: new Date().toISOString() })
          .eq('id', p.id);
        if (error) console.log(`    ⚠ não gravou: ${error.message}`);
        else gravou++;
      }
    }
    if ((n + 1) % 100 === 0) console.log(`  … ${n + 1}/${alvos.length} — ${achou} fotos`);
    await sleep(600); // educação com as lojas
  }

  console.log(`\nFotos encontradas: ${achou} de ${alvos.length}`);
  if (dry) console.log('Nada gravado (--dry).');
  else {
    console.log(`Gravadas: ${gravou}.`);
    console.log('Nenhum produto foi ativado — confira na tela "A completar" e ative os que quiser.');
  }
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
