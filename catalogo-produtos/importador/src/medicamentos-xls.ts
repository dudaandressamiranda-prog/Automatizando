/**
 * Planilha de todos os produtos da categoria Medicamentos — a principal e
 * todas as subcategorias.
 *
 * Categoria é uma string só ("Medicamentos > Antiparasitários > Externos");
 * pertencer ao grupo é o nome começar com "medicamentos" antes do primeiro
 * ">". A comparação ignora acento e caixa para não perder variação de
 * grafia entre categorias cadastradas em momentos diferentes.
 *
 * Uso:
 *   npm run medicamentos-xls
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

const ARQUIVO = 'medicamentos.xlsx';
const VERDE = 'FF25756C';
const GRUPO = 'medicamentos';

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const topo = (nomeCategoria: string) => norm(nomeCategoria.split('>')[0] ?? '');
const sub = (nomeCategoria: string) => {
  const i = nomeCategoria.indexOf('>');
  return i === -1 ? '' : nomeCategoria.slice(i + 1).trim();
};

interface Linha {
  name: string;
  brand: string | null;
  supplier: string | null;
  barcode: string | null;
  status: string;
  photo_path: string | null;
  photo_source_url: string | null;
  category_id: string | null;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.');
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: cats, error: erroCats } = await db.from('categories').select('id, name');
  if (erroCats) throw new Error(erroCats.message);

  const deMedicamentos = new Map((cats ?? []).filter((c) => topo(c.name) === GRUPO).map((c) => [c.id as string, c.name as string]));
  if (deMedicamentos.size === 0) {
    throw new Error('Nenhuma categoria "Medicamentos" encontrada — confira o nome no catálogo.');
  }
  console.log(`Categorias em Medicamentos: ${deMedicamentos.size} (principal + subcategorias)`);

  const produtos: Linha[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('products')
      .select('name, brand, supplier, barcode, status, photo_path, photo_source_url, category_id')
      .in('category_id', [...deMedicamentos.keys()])
      .order('name')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    produtos.push(...((data ?? []) as Linha[]));
    if (!data || data.length < 1000) break;
  }
  console.log(`Produtos encontrados: ${produtos.length}`);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Medicamentos');
  ws.columns = [
    { header: 'Produto', key: 'nome', width: 52 },
    { header: 'Subcategoria', key: 'sub', width: 30 },
    { header: 'Marca', key: 'marca', width: 20 },
    { header: 'Fornecedor', key: 'fornecedor', width: 22 },
    { header: 'Código de barras', key: 'codigo', width: 18 },
    { header: 'Situação', key: 'situacao', width: 14 },
    { header: 'Tem foto', key: 'foto', width: 10 },
  ];

  const situacaoLabel: Record<string, string> = {
    ativo: 'Ativo', desativado: 'Desativado', descontinuado: 'Descontinuado',
  };

  for (const p of produtos) {
    const nomeCat = p.category_id ? deMedicamentos.get(p.category_id) ?? '' : '';
    const linha = ws.addRow({
      nome: p.name,
      sub: sub(nomeCat) || '(categoria principal)',
      marca: p.brand ?? '',
      fornecedor: p.supplier ?? '',
      codigo: p.barcode ?? '',
      situacao: situacaoLabel[p.status] ?? p.status,
      foto: p.photo_path || p.photo_source_url ? 'sim' : 'não',
    });
    linha.getCell('codigo').numFmt = '@'; // texto, para não comer zero à esquerda
  }

  const cab = ws.getRow(1);
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
  cab.height = 22;
  cab.alignment = { vertical: 'middle' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };

  await wb.xlsx.writeFile(ARQUIVO);
  console.log(`\nArquivo: ${ARQUIVO}`);
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
