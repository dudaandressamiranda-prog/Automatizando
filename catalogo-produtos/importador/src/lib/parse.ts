import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { mapCategory } from './catmap.js';
import { classifyByName } from './classify.js';
import { type ColumnMap, type Field, detectColumns, detectStoreColumns } from './columns.js';
import { cleanBarcode, isValidEan, norm } from './normalize.js';

export type RowStatus = 'ativo' | 'desativado' | 'descontinuado';

/** Linha da planilha já traduzida para os campos do catálogo. */
export interface ImportRow {
  line: number; // linha na planilha (1 = cabeçalho), para mensagens de erro
  name: string;
  barcode: string | null;
  brand: string | null;
  supplier: string | null;
  category: string | null;
  externalId: string | null;
  externalUrl: string | null;
  photoUrl: string | null;
  status: RowStatus | null;
  /** Estoque total da planilha, quando ela traz. null = planilha não informa. */
  stock: number | null;
  /**
   * Estoque só das LOJAS FÍSICAS, quando a planilha separa por depósito.
   * Serve para provar que o produto está na prateleira: o Tiny (loja online)
   * não vende tudo o que as lojas vendem, então "inativo no Tiny" não pode
   * desativar produto que o balcão tem em estoque.
   *
   * Não é o número que decide se o produto entra — para isso vale o `stock`
   * total, porque também existe o caminho inverso: produto que só vende no
   * e-commerce fica zerado nas duas lojas e nem por isso sai do catálogo.
   */
  storeStock: number | null;
}

/** Nomes genéricos demais para virar produto de catálogo. */
export const NOME_GENERICO =
  /^\s*(produtos?|itens?|diversos|avulsos?|sortidos?)\b|\bvariados\b|\ba granel\b/i;

/** Traduz a situação da planilha ("Ativo"/"Inativo"…) para o status do catálogo. */
const STATUS_MAP: Record<string, RowStatus> = {
  ativo: 'ativo',
  inativo: 'desativado',
  desativado: 'desativado',
  descontinuado: 'descontinuado',
  excluido: 'descontinuado',
};

export interface ParseResult {
  rows: ImportRow[];
  warnings: string[];
  columnMap: ColumnMap;
  /** Colunas de estoque das lojas físicas (vazio se a planilha não separa). */
  storeColumns: string[];
  unmatchedHeaders: string[];
  kitsSkipped: number;
  genericSkipped: number;
}

/**
 * Kits/combos de marketplace não entram no catálogo — aqui é só o
 * cadastro único de cada produto físico. Duas defesas:
 *  - coluna de tipo do ERP (Tiny/Olist): valor "K" = kit → pulado;
 *  - nome com cara de anúncio: "2 x ...", "Kit ...", "3 Pacotes ...",
 *    "Combo ..." → pulado com aviso (para conferência no dry-run).
 */
export const KIT_NAME =
  /(^\s*\d+\s*x\s)|(^\s*kit\b)|(^\s*\d+\s+(pacotes?|unidades?|pares?|caixas?|frascos?)\b)|(\bcombo\b)/i;

function cell(record: Record<string, unknown>, col: string | undefined): string | null {
  if (!col) return null;
  const v = record[col];
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** Converte registros brutos (cabeçalho → valor) em ImportRow[], validando. */
export function toImportRows(
  headers: string[],
  records: Record<string, unknown>[],
  overrides: ColumnMap = {},
): ParseResult {
  const { map, unmatched } = detectColumns(headers, overrides);
  if (!map.name) {
    throw new Error(
      `Não achei a coluna do nome do produto. Cabeçalhos: ${headers.join(', ')}. ` +
        `Use --map name="Nome da Coluna" para indicar manualmente.`,
    );
  }
  const storeColumns = detectStoreColumns(headers);

  const rows: ImportRow[] = [];
  const warnings: string[] = [];
  let kitsSkipped = 0;
  let genericSkipped = 0;

  records.forEach((record, i) => {
    const line = i + 2; // +1 do cabeçalho, +1 porque planilha começa em 1
    const name = cell(record, map.name);
    if (!name) {
      warnings.push(`Linha ${line}: sem nome de produto — ignorada.`);
      return;
    }

    const kind = cell(record, map.kind);
    if (kind && norm(kind) === 'k') {
      kitsSkipped++;
      return;
    }
    if (KIT_NAME.test(name)) {
      warnings.push(`Linha ${line} ("${name}"): parece kit/pacote de anúncio — ignorada.`);
      kitsSkipped++;
      return;
    }
    if (NOME_GENERICO.test(name)) {
      warnings.push(`Linha ${line} ("${name}"): nome genérico demais para o catálogo — ignorada.`);
      genericSkipped++;
      return;
    }

    const rawBarcode = map.barcode ? (record[map.barcode] as string | number | null | undefined) : null;
    const bc = cleanBarcode(rawBarcode ?? null);
    let barcode: string | null = null;
    if (bc.ok) {
      barcode = bc.value;
    } else {
      warnings.push(`Linha ${line} ("${name}"): código de barras inválido "${bc.raw}" — importada sem código.`);
    }
    // Sem código de barras: aceita o SKU só quando ele é um EAN de verdade —
    // formato certo E dígito verificador fechando. Código interno numérico
    // (e SKU com "x"/letras do ERP) não passa.
    if (!barcode && map.sku) {
      const alt = cleanBarcode((record[map.sku] as string | number | null | undefined) ?? null);
      if (alt.ok && alt.value && isValidEan(alt.value)) barcode = alt.value;
    }

    const numero = (raw: unknown): number | null => {
      const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    };

    const stock = map.stock ? numero(record[map.stock]) : null;

    let storeStock: number | null = null;
    if (storeColumns.length > 0) {
      storeStock = storeColumns.reduce((soma, col) => soma + (numero(record[col]) ?? 0), 0);
    }

    let photoUrl = cell(record, map.photoUrl);
    if (photoUrl && !/^https?:\/\//i.test(photoUrl)) {
      warnings.push(`Linha ${line} ("${name}"): "${photoUrl.slice(0, 40)}" não parece um link de imagem — ignorado.`);
      photoUrl = null;
    }

    const rawStatus = cell(record, map.status);
    let status: RowStatus | null = null;
    if (rawStatus) {
      status = STATUS_MAP[norm(rawStatus)] ?? null;
      if (!status) {
        warnings.push(`Linha ${line} ("${name}"): situação "${rawStatus}" desconhecida — status não alterado.`);
      }
    }

    rows.push({
      line,
      name,
      barcode,
      brand: cell(record, map.brand),
      supplier: cell(record, map.supplier),
      // sem categoria na planilha, o classificador por nome dá o palpite
      category: mapCategory(cell(record, map.category)) ?? classifyByName(name),
      externalId: cell(record, map.externalId),
      externalUrl: cell(record, map.externalUrl),
      photoUrl,
      status,
      stock,
      storeStock,
    });
  });

  return { rows, warnings, columnMap: map, storeColumns, unmatchedHeaders: unmatched, kitsSkipped, genericSkipped };
}

async function readCsv(filePath: string): Promise<{ headers: string[]; records: Record<string, unknown>[] }> {
  const text = await readFile(filePath, 'utf8');
  const parsed = Papa.parse<Record<string, unknown>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
  });
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0]!;
    throw new Error(`Erro lendo CSV (linha ${(first.row ?? 0) + 2}): ${first.message}`);
  }
  return { headers: parsed.meta.fields ?? [], records: parsed.data };
}

async function readXlsx(filePath: string): Promise<{ headers: string[]; records: Record<string, unknown>[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Arquivo Excel sem planilhas.');

  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: false }, (c, colNumber) => {
    headers[colNumber - 1] = String(c.value ?? '').trim();
  });

  const records: Record<string, unknown>[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const rec: Record<string, unknown> = {};
    let hasValue = false;
    headers.forEach((h, idx) => {
      if (!h) return;
      const c = row.getCell(idx + 1);
      // exceljs devolve objetos para fórmulas/richText/hyperlinks — reduz para texto
      let v: unknown = c.value;
      if (v && typeof v === 'object') {
        if ('result' in v) v = (v as { result: unknown }).result;
        else if ('richText' in v) v = (v as { richText: { text: string }[] }).richText.map((t) => t.text).join('');
        else if ('hyperlink' in v) v = (v as { text?: unknown; hyperlink: string }).text ?? (v as { hyperlink: string }).hyperlink;
        else if (v instanceof Date) v = v.toISOString();
      }
      if (v !== null && v !== undefined && String(v).trim() !== '') hasValue = true;
      rec[h] = v as never;
    });
    if (hasValue) records.push(rec);
  });

  return { headers: headers.filter(Boolean), records };
}

/** Lê a planilha crua (todas as linhas, sem regra nenhuma) — usada também pelo relatório de faltantes. */
export async function readSpreadsheet(
  filePath: string,
): Promise<{ headers: string[]; records: Record<string, unknown>[] }> {
  const ext = path.extname(filePath).toLowerCase();
  const raw =
    ext === '.csv' || ext === '.tsv'
      ? await readCsv(filePath)
      : ext === '.xlsx' || ext === '.xlsm'
        ? await readXlsx(filePath)
        : null;
  if (!raw) throw new Error(`Extensão não suportada: "${ext}". Use .csv ou .xlsx.`);
  return raw;
}

/** Lê CSV ou Excel e devolve as linhas prontas para o plano de importação. */
export async function parseFile(filePath: string, overrides: ColumnMap = {}): Promise<ParseResult> {
  const raw = await readSpreadsheet(filePath);
  return toImportRows(raw.headers, raw.records, overrides);
}

export type { Field, ColumnMap };
