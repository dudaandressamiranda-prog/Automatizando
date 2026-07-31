/**
 * Planilha dos produtos ATIVOS que ainda não têm código de barras.
 *
 * Serve como lista de trabalho de balcão: a coluna "Código de barras" sai
 * vazia e formatada como TEXTO, para que o Excel não coma o zero à esquerda
 * quando alguém digitar o EAN lido do produto.
 *
 * Uso:
 *   npm run sem-codigo
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

const ARQUIVO = 'produtos-sem-codigo.xlsx';
const VERDE = 'FF25756C'; // verde da marca, usado no cabeçalho
const CREME = 'FFFFF8E1'; // destaque da coluna a preencher

interface Linha {
  id: string;
  name: string;
  brand: string | null;
  supplier: string | null;
  photo_path: string | null;
  category_id: string | null;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.');
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: cats, error: erroCats } = await db.from('categories').select('id, name');
  if (erroCats) throw new Error(erroCats.message);
  const nomeCat = new Map((cats ?? []).map((c) => [c.id as string, c.name as string]));

  // o Supabase devolve no máximo 1000 linhas por chamada
  const prods: Linha[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('products')
      .select('id, name, brand, supplier, photo_path, category_id')
      .eq('status', 'ativo')
      .is('barcode', null)
      .order('name')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    prods.push(...((data ?? []) as Linha[]));
    if (!data || data.length < 1000) break;
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sem código');
  ws.columns = [
    { header: 'Produto', key: 'nome', width: 52 },
    { header: 'Marca', key: 'marca', width: 20 },
    { header: 'Categoria', key: 'categoria', width: 32 },
    { header: 'Fornecedor', key: 'fornecedor', width: 22 },
    { header: 'Tem foto', key: 'foto', width: 10 },
    { header: 'Código de barras', key: 'codigo', width: 20 },
    { header: 'ID no sistema', key: 'id', width: 38 },
  ];

  const cab = ws.getRow(1);
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
  cab.alignment = { vertical: 'middle' };
  cab.height = 22;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = 'A1:G1';

  for (const p of prods) {
    ws.addRow({
      nome: p.name,
      marca: p.brand ?? '',
      categoria: p.category_id ? nomeCat.get(p.category_id) ?? '' : '',
      fornecedor: p.supplier ?? '',
      foto: p.photo_path ? 'sim' : 'não',
      codigo: '',
      id: p.id,
    });
  }

  // coluna a preencher: texto puro, senão o Excel transforma 0789… em 789…
  const col = ws.getColumn('codigo');
  col.numFmt = '@';
  col.eachCell({ includeEmpty: true }, (cell, linha) => {
    if (linha === 1) return;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CREME } };
  });

  await wb.xlsx.writeFile(ARQUIVO);
  console.log(`ativos sem código de barras: ${prods.length}`);
  console.log(`arquivo: ${ARQUIVO}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
