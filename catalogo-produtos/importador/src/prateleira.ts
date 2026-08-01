/**
 * Produtos que estão na PRATELEIRA mas não estão no catálogo.
 *
 * O robô de fotos (`npm run fotos`) só olha para quem tem estoque no Tiny,
 * e é justamente por isso que esses nunca foram processados: o que vende no
 * balcão não passa pelo Tiny, então para o ERP eles estão zerados. Quem
 * sabe onde a mercadoria está de verdade é a planilha do painel, que separa
 * o estoque por loja.
 *
 * Aqui os dois arquivos são cruzados: nome e situação vêm do ERP, o estoque
 * de cada loja vem do painel. Sobra a lista do que está na prateleira e
 * fora da vitrine — e para cada um o script procura a foto pelo EAN nas
 * lojas grandes, porque foto é o que trava a entrada no catálogo.
 *
 * Não grava nada: é relatório para conferir antes de importar.
 *
 * Uso:
 *   npm run prateleira -- tiny.csv painel.csv
 *   npm run prateleira -- tiny.csv painel.csv --sem-foto   # só a lista, na hora
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import { detectColumns, detectStoreColumns } from './lib/columns.js';
import { buscarFoto, sleep } from './lib/fotoweb.js';
import { isIgnorado, loadIgnorados } from './lib/ignorados.js';
import { cleanBarcode, norm } from './lib/normalize.js';
import { KIT_NAME, readSpreadsheet } from './lib/parse.js';

const ARQUIVO = 'prateleira.xlsx';
const VERDE = 'FF25756C';

const numero = (v: unknown) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

interface Item {
  nome: string;
  marca: string;
  ean: string;
  idErp: string;
  lojas: Record<string, number>;
  totalLojas: number;
  tiny: number;
  /** Onde a mercadoria está: define se dá para bipar na loja ou não. */
  onde: 'só lojas' | 'só Tiny' | 'lojas e Tiny';
  foto: string;
  nomeNaLoja: string;
  ondeAchou: string;
}

async function main() {
  const args = process.argv.slice(2);
  const semFoto = args.includes('--sem-foto');
  const [arqTiny, arqPainel] = args.filter((a) => !a.startsWith('--'));
  if (!arqTiny || !arqPainel) {
    throw new Error('Informe os dois arquivos: npm run prateleira -- tiny.csv painel.csv');
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.');
  const db = createClient(url, key, { auth: { persistSession: false } });

  // ---- painel: quanto tem em cada loja ---------------------------------
  console.log(`Lendo ${arqPainel}...`);
  const painel = await readSpreadsheet(arqPainel);
  const pm = detectColumns(painel.headers).map;
  const colunasLoja = detectStoreColumns(painel.headers);
  if (colunasLoja.length === 0) {
    throw new Error(`Não achei colunas de loja em ${arqPainel}. Cabeçalhos: ${painel.headers.join(', ')}`);
  }
  console.log(`  lojas: ${colunasLoja.join(', ')}`);

  type Estoque = { lojas: Record<string, number>; total: number };
  const painelPorEan = new Map<string, Estoque>();
  const painelPorNome = new Map<string, Estoque>();
  for (const r of painel.records) {
    const lojas: Record<string, number> = {};
    let total = 0;
    for (const c of colunasLoja) {
      const n = numero(r[c]);
      lojas[c] = n;
      total += n;
    }
    const e = { lojas, total };
    const bc = cleanBarcode(String(r[pm.barcode!] ?? ''));
    if (bc.ok && bc.value) painelPorEan.set(bc.value, e);
    const nome = norm(String(r[pm.name!] ?? ''));
    if (nome) painelPorNome.set(nome, e);
  }

  // ---- catálogo: o que já entrou ---------------------------------------
  console.log('Consultando o catálogo...');
  const jaTem = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('products').select('barcode, external_id').range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const p of data ?? []) {
      if (p.barcode) jaTem.add(p.barcode);
      if (p.external_id) jaTem.add(`id:${p.external_id}`);
    }
    if (!data || data.length < 1000) break;
  }

  // ---- ERP: ativos, sem foto, fora do catálogo -------------------------
  console.log(`Lendo ${arqTiny}...`);
  const tiny = await readSpreadsheet(arqTiny);
  const tm = detectColumns(tiny.headers).map;
  const ignorados = loadIgnorados();

  const itens: Item[] = [];
  let semEan = 0;
  for (const r of tiny.records) {
    const nome = String(r[tm.name!] ?? '').trim();
    if (!nome || KIT_NAME.test(nome)) continue;
    if (norm(String(r[tm.status!] ?? '')) !== 'ativo') continue;
    if (tm.photoUrl && String(r[tm.photoUrl] ?? '').trim()) continue; // já tem foto: não é este grupo

    const bc = cleanBarcode(String(r[tm.barcode!] ?? ''));
    const ean = bc.ok && bc.value ? bc.value : '';
    const idErp = String(r[tm.externalId!] ?? '');
    if ((ean && jaTem.has(ean)) || (idErp && jaTem.has(`id:${idErp}`))) continue; // já no catálogo

    const estoquePainel = (ean && painelPorEan.get(ean)) || painelPorNome.get(norm(nome));
    const totalLojas = estoquePainel?.total ?? 0;
    const noTiny = tm.stock ? numero(r[tm.stock]) : 0;
    if (totalLojas <= 0 && noTiny <= 0) continue; // parado em todo lugar: não é prateleira

    // descartados de vez (ignorados.csv) não voltam pela porta dos fundos
    if (isIgnorado(ignorados, { externalId: idErp || null, barcode: ean || null })) continue;
    const marca = tm.brand ? String(r[tm.brand] ?? '').trim() : '';
    if (!ean) semEan++;

    itens.push({
      nome, marca, ean, idErp,
      lojas: estoquePainel?.lojas ?? {},
      totalLojas,
      tiny: noTiny,
      onde: totalLojas > 0 && noTiny > 0 ? 'lojas e Tiny' : totalLojas > 0 ? 'só lojas' : 'só Tiny',
      foto: '', nomeNaLoja: '', ondeAchou: '',
    });
  }

  const conta = (o: Item['onde']) => itens.filter((i) => i.onde === o).length;
  console.log('');
  console.log(`Na prateleira e fora do catálogo:  ${itens.length}`);
  console.log(`  estoque só nas lojas físicas:    ${conta('só lojas')}`);
  console.log(`  estoque nas lojas E no Tiny:     ${conta('lojas e Tiny')}`);
  console.log(`  estoque só no Tiny:              ${conta('só Tiny')}`);
  console.log(`  sem EAN (não dá para buscar):    ${semEan}`);

  // ---- foto ------------------------------------------------------------
  if (!semFoto) {
    const comEan = itens.filter((i) => i.ean);
    console.log(`\nProcurando foto de ${comEan.length} produtos (leva alguns minutos)...`);
    let achou = 0;
    for (const [n, item] of comEan.entries()) {
      const hit = await buscarFoto(item.ean);
      if (hit) {
        item.foto = hit.image;
        item.nomeNaLoja = hit.storeName;
        item.ondeAchou = hit.shop;
        achou++;
      }
      if ((n + 1) % 50 === 0) console.log(`  ${n + 1}/${comEan.length} — ${achou} fotos`);
      await sleep(600); // educação com as lojas
    }
    console.log(`\nFotos encontradas: ${achou} de ${comEan.length}`);
  }

  // ---- relatório -------------------------------------------------------
  itens.sort((a, b) => b.totalLojas + b.tiny - (a.totalLojas + a.tiny));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Na prateleira');
  ws.columns = [
    { header: 'Produto', key: 'nome', width: 52 },
    { header: 'Marca', key: 'marca', width: 20 },
    { header: 'Código de barras', key: 'ean', width: 18 },
    ...colunasLoja.map((c) => ({ header: c, key: c, width: 14 })),
    { header: 'Tiny', key: 'tiny', width: 9 },
    { header: 'Onde tem estoque', key: 'onde', width: 16 },
    { header: 'Achou foto', key: 'temFoto', width: 11 },
    { header: 'Link da foto', key: 'foto', width: 46 },
    { header: 'Nome na loja que achou', key: 'nomeLoja', width: 44 },
    { header: 'Loja', key: 'loja', width: 22 },
    { header: 'ID no ERP', key: 'id', width: 14 },
  ];

  for (const i of itens) {
    const linha: Record<string, string | number> = {
      nome: i.nome, marca: i.marca, ean: i.ean,
      tiny: i.tiny, onde: i.onde,
      temFoto: semFoto ? '—' : i.foto ? 'sim' : 'não',
      foto: i.foto, nomeLoja: i.nomeNaLoja, loja: i.ondeAchou, id: i.idErp,
    };
    for (const c of colunasLoja) linha[c] = i.lojas[c] ?? 0;
    const r = ws.addRow(linha);
    r.getCell('ean').numFmt = '@';
    if (i.foto) {
      r.getCell('temFoto').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7F5EC' } };
    }
  }

  const cab = ws.getRow(1);
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
  cab.height = 24;
  cab.alignment = { vertical: 'middle', wrapText: true };
  ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };

  await wb.xlsx.writeFile(ARQUIVO);
  console.log(`\nRelatório: ${ARQUIVO}`);
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
