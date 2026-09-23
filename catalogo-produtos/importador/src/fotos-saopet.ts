/**
 * Busca fotos para os itens de uma nota fiscal do fornecedor São Pet
 * (Bastet Indústria e Comércio) direto em saopet.com.br.
 *
 * Esse fornecedor não é VTEX — não dá pra procurar pelo código de barras
 * (o site nem guarda EAN nos dados). Mas o código do PRODUTO na nota
 * (`cProd`, ex.: "120G-2") é o MESMO código que o site usa como
 * "Referência" (campo `sku` nos dados da página) — confirmado nos itens
 * dessa nota. Então a busca é por esse código, não por palavra do nome:
 * muito mais preciso que tentar casar nome parecido.
 *
 * Uso:
 *   npm run fotos-saopet -- caminho/da/nota.xml               # só procura e lista
 *   npm run fotos-saopet -- caminho/da/nota.xml --apply        # grava a foto achada
 *
 * --apply só GRAVA em produto que:
 *   - já existe no catálogo (achado pelo EAN da nota) — este script não
 *     cadastra produto novo, isso é trabalho da tela de Entrada de nota;
 *   - ainda está sem foto — nunca troca uma foto que já foi escolhida.
 */
import 'dotenv/config';
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

const ARQUIVO = 'fotos-saopet.xlsx';
const VERDE = 'FF25756C';
const SITE = 'saopet.com.br';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ItemNota {
  nome: string;
  ean: string;
  cProd: string;
}

/** Lê <det>...<xProd>, <cEAN> e <cProd> direto do XML — sem depender de biblioteca de NF-e. */
function lerItensNfe(caminho: string): ItemNota[] {
  const xml = readFileSync(caminho, 'utf8');
  const dets = [...xml.matchAll(/<det[^>]*>([\s\S]*?)<\/det>/g)].map((m) => m[1]!);
  return dets.map((d) => {
    const campo = (tag: string) => (d.match(new RegExp(`<${tag}>([^<]*)</${tag}>`)) ?? ['', ''])[1]!;
    return { nome: campo('xProd'), ean: campo('cEAN'), cProd: campo('cProd') };
  });
}

interface Variacao {
  sku: string;
  name: string;
  image: string;
}

const unescapeAttr = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** Todas as variações (tamanho/cor) presentes numa página de busca ou de produto. */
function extrairVariacoes(html: string): Variacao[] {
  const variacoes: Variacao[] = [];
  const re = /onclick="updateProductVariation\((.*?)\)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const obj = JSON.parse(unescapeAttr(m[1]!));
      if (obj.sku && obj.image) variacoes.push({ sku: String(obj.sku), name: String(obj.name ?? ''), image: String(obj.image) });
    } catch {
      // blob de variação corrompido ou de outro widget — ignora essa ocorrência
    }
  }
  return variacoes;
}

/** Busca no site pelo código do produto e devolve a variação com o sku exato. */
async function buscarPorCodigo(cProd: string): Promise<Variacao | null> {
  const url = `https://${SITE}/index.php?route=product/search&search=${encodeURIComponent(cProd)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const html = await res.text();
  const variacoes = extrairVariacoes(html);
  return variacoes.find((v) => v.sku === cProd) ?? null;
}

interface Resultado extends ItemNota {
  achado: boolean;
  nomeSite: string;
  foto: string;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const caminho = args.find((a) => !a.startsWith('--'));
  if (!caminho || !existsSync(caminho)) {
    throw new Error('Informe o caminho do XML da nota: npm run fotos-saopet -- nota.xml [--apply]');
  }

  const itens = lerItensNfe(caminho);
  console.log(`Nota lida: ${itens.length} itens.`);
  console.log(`Procurando em ${SITE} pelo código de cada item (uma pausa entre chamadas)...\n`);

  const resultados: Resultado[] = [];
  let achados = 0;
  for (const item of itens) {
    let variacao: Variacao | null = null;
    if (item.cProd) variacao = await buscarPorCodigo(item.cProd);
    if (variacao) {
      achados++;
      console.log(`  ✓ ${item.nome.slice(0, 45).padEnd(47)} [${item.cProd}] → ${variacao.name}`);
    } else {
      console.log(`  ✗ ${item.nome.slice(0, 45).padEnd(47)} [${item.cProd}]`);
    }
    resultados.push({ ...item, achado: Boolean(variacao), nomeSite: variacao?.name ?? '', foto: variacao?.image ?? '' });
    await sleep(500); // educação com o site — mesma cortesia dos outros robôs do importador
  }

  console.log(`\nFotos encontradas: ${achados} de ${itens.length}.`);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Fotos São Pet');
  ws.columns = [
    { header: 'Produto (nota)', key: 'nome', width: 46 },
    { header: 'Código de barras', key: 'ean', width: 18 },
    { header: 'Código do fornecedor', key: 'cProd', width: 18 },
    { header: 'Achado no site', key: 'achado', width: 14 },
    { header: 'Nome no site', key: 'nomeSite', width: 46 },
    { header: 'Link da foto', key: 'foto', width: 60 },
  ];
  for (const r of resultados) {
    const linha = ws.addRow({ ...r, ean: r.ean, achado: r.achado ? 'sim' : 'não' });
    linha.getCell('ean').numFmt = '@';
    if (!r.achado) linha.getCell('achado').font = { color: { argb: 'FFB91C1C' }, bold: true };
  }
  const cab = ws.getRow(1);
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
  cab.height = 22;
  cab.alignment = { vertical: 'middle' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  await wb.xlsx.writeFile(ARQUIVO);
  console.log(`\nRelatório: ${ARQUIVO}`);

  if (!apply) {
    console.log('\nNada foi gravado. Rode de novo com --apply para gravar as fotos achadas.');
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.');
  const db = createClient(url, key, { auth: { persistSession: false } });

  let gravados = 0;
  let jaTinhamFoto = 0;
  let naoCadastrados = 0;
  for (const r of resultados.filter((x) => x.achado)) {
    const { data: prod, error } = await db
      .from('products')
      .select('id, photo_path, photo_source_url')
      .eq('barcode', r.ean)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!prod) {
      naoCadastrados++;
      continue;
    }
    if (prod.photo_path || prod.photo_source_url) {
      jaTinhamFoto++;
      continue;
    }
    const { error: updErr } = await db.from('products').update({ photo_source_url: r.foto }).eq('id', prod.id);
    if (updErr) throw new Error(updErr.message);
    gravados++;
  }
  console.log(`\nGravados agora: ${gravados}`);
  console.log(`Já tinham foto (não mexi): ${jaTinhamFoto}`);
  console.log(`Ainda não cadastrados no catálogo (achei a foto, mas não tem onde gravar ainda): ${naoCadastrados}`);
  console.log('Produto que só falta ativar continua em "A completar"/"A revisar" — ativa por lá quando conferir.');
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
