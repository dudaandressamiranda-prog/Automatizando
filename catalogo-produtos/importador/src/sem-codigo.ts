/**
 * Planilha dos produtos ATIVOS que ainda não têm código de barras.
 *
 * Serve como lista de trabalho de balcão: a coluna "Código de barras" sai
 * vazia e formatada como TEXTO, para que o Excel não coma o zero à esquerda
 * quando alguém digitar o EAN lido do produto.
 *
 * Passando as planilhas de origem, cada linha vem com o MOTIVO de estar
 * sem código e o palpite quando existe. Muda o que fazer com a linha:
 * "cadastro pai com variações" pede separar o cadastro, "código inventado
 * na planilha" pede gerar EAN interno, e só "sem candidato" pede mesmo ir
 * até a prateleira bipar o produto.
 *
 * Uso:
 *   npm run sem-codigo                              # só a lista
 *   npm run sem-codigo -- chefe.csv tiny.csv        # lista com o motivo
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import { Indice, carregarFontes, diagnosticar } from './lib/similar.js';

const ARQUIVO = 'produtos-sem-codigo.xlsx';
const VERDE = 'FF25756C'; // verde da marca, usado no cabeçalho
const CREME = 'FFFFF8E1'; // destaque da coluna a preencher

interface Linha {
  id: string;
  name: string;
  brand: string | null;
  supplier: string | null;
  photo_path: string | null;
  photo_source_url: string | null;
  category_id: string | null;
}

/** O que fazer com a linha, em português de quem vai resolver. */
const RECADO = {
  sugestao: 'código encontrado na planilha — confira e use o sugerido',
  'codigo-invalido': 'o código da planilha é inventado — gerar EAN interno',
  repetido: 'o código já é de outro cadastro — produto repetido, juntar',
  variacoes: 'cadastro pai: cada variação tem seu código — separar ou escolher',
  nada: 'não existe em planilha nenhuma — bipar o produto na loja',
} as const;

async function main() {
  const arquivos = process.argv.slice(2).filter((a) => !a.startsWith('--'));

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.');
  const db = createClient(url, key, { auth: { persistSession: false } });

  let indice: Indice | null = null;
  if (arquivos.length > 0) {
    console.log('Lendo as planilhas...');
    indice = new Indice(await carregarFontes(arquivos));
  }

  const { data: cats, error: erroCats } = await db.from('categories').select('id, name');
  if (erroCats) throw new Error(erroCats.message);
  const nomeCat = new Map((cats ?? []).map((c) => [c.id as string, c.name as string]));

  // o Supabase devolve no máximo 1000 linhas por chamada
  const prods: Linha[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('products')
      .select('id, name, brand, supplier, photo_path, photo_source_url, category_id')
      .eq('status', 'ativo')
      .is('barcode', null)
      .order('name')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    prods.push(...((data ?? []) as Linha[]));
    if (!data || data.length < 1000) break;
  }

  // códigos já em uso: um palpite que aponta para um deles não é código
  // faltando, é cadastro repetido
  const jaUsados = new Set<string>();
  if (indice) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db
        .from('products')
        .select('barcode')
        .not('barcode', 'is', null)
        .order('barcode')
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      for (const r of data ?? []) jaUsados.add(r.barcode as string);
      if (!data || data.length < 1000) break;
    }
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
    ...(indice
      ? [
          { header: 'Por que está sem código', key: 'motivo', width: 52 },
          { header: 'Palpite', key: 'palpite', width: 18 },
          { header: 'Nome na planilha', key: 'fonte', width: 46 },
        ]
      : []),
    { header: 'ID no sistema', key: 'id', width: 38 },
  ];

  const cab = ws.getRow(1);
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
  cab.alignment = { vertical: 'middle' };
  cab.height = 22;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };

  const placar = new Map<string, number>();
  for (const p of prods) {
    const linha: Record<string, string> = {
      nome: p.name,
      marca: p.brand ?? '',
      categoria: p.category_id ? nomeCat.get(p.category_id) ?? '' : '',
      fornecedor: p.supplier ?? '',
      foto: p.photo_path || p.photo_source_url ? 'sim' : 'não',
      codigo: '',
      id: p.id,
    };

    if (indice) {
      const d = diagnosticar(p.name, p.brand, indice, (e) => jaUsados.has(e));
      linha.motivo = RECADO[d.tipo];
      placar.set(d.tipo, (placar.get(d.tipo) ?? 0) + 1);
      if (d.tipo === 'variacoes') {
        linha.palpite = d.eans.join(' / ');
        linha.fonte = d.exemplos;
      } else if (d.tipo !== 'nada') {
        linha.palpite = d.melhor.f.ean;
        linha.fonte = d.melhor.f.nome;
      }
    }

    const r = ws.addRow(linha);
    if (indice) r.getCell('palpite').numFmt = '@';
  }

  // Palpite que serve para mais de um produto é fornecedor usando um código
  // só para a família toda (as três cores do mordedor, o P e o M da coleira).
  // O banco só deixa um dono ter cada código, então avisar aqui evita a
  // pessoa aplicar nos três e esbarrar no erro de código repetido.
  if (indice) {
    const donos = new Map<string, number>();
    ws.eachRow((r, i) => {
      if (i === 1) return;
      const palpite = String(r.getCell('palpite').value ?? '');
      const motivo = String(r.getCell('motivo').value ?? '');
      if (palpite && motivo === RECADO.sugestao) donos.set(palpite, (donos.get(palpite) ?? 0) + 1);
    });
    ws.eachRow((r, i) => {
      if (i === 1) return;
      const n = donos.get(String(r.getCell('palpite').value ?? '')) ?? 0;
      if (n > 1) {
        r.getCell('motivo').value =
          `um código só para ${n} variações — o catálogo só deixa um ficar com ele`;
      }
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
  console.log(`\nativos sem código de barras: ${prods.length}`);
  for (const [tipo, n] of [...placar.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${RECADO[tipo as keyof typeof RECADO]}`);
  }
  console.log(`\narquivo: ${ARQUIVO}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
