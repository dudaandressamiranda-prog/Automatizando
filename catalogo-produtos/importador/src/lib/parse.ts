import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { type ColumnMap, type Field, detectColumns } from './columns.js';
import { cleanBarcode, norm } from './normalize.js';

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
}

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
  unmatchedHeaders: string[];
}

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

  const rows: ImportRow[] = [];
  const warnings: string[] = [];

  records.forEach((record, i) => {
    const line = i + 2; // +1 do cabeçalho, +1 porque planilha começa em 1
    const name = cell(record, map.name);
    if (!name) {
      warnings.push(`Linha ${line}: sem nome de produto — ignorada.`);
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
      category: cell(record, map.category),
      externalId: cell(record, map.externalId),
      externalUrl: cell(record, map.externalUrl),
      photoUrl,
      status,
    });
  });

  return { rows, warnings, columnMap: map, unmatchedHeaders: unmatched };
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

/** Lê CSV ou Excel e devolve as linhas prontas para o plano de importação. */
export async function parseFile(filePath: string, overrides: ColumnMap = {}): Promise<ParseResult> {
  const ext = path.extname(filePath).toLowerCase();
  const raw =
    ext === '.csv' || ext === '.tsv'
      ? await readCsv(filePath)
      : ext === '.xlsx' || ext === '.xlsm'
        ? await readXlsx(filePath)
        : null;
  if (!raw) throw new Error(`Extensão não suportada: "${ext}". Use .csv ou .xlsx.`);
  return toImportRows(raw.headers, raw.records, overrides);
}

export type { Field, ColumnMap };
