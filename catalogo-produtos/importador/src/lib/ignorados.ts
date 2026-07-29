/**
 * Lista de produtos descartados de vez (importador/ignorados.csv):
 * itens que existem na planilha do ERP mas que decidimos nunca trazer
 * para o catálogo. O importador, o robô de fotos e o relatório de
 * faltantes pulam qualquer linha cujo ID do ERP ou código de barras
 * esteja aqui. Para reativar um produto, basta apagar a linha dele.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'ignorados.csv');

export interface Ignorados {
  externalIds: Set<string>;
  barcodes: Set<string>;
  size: number;
}

export function loadIgnorados(): Ignorados {
  const externalIds = new Set<string>();
  const barcodes = new Set<string>();
  let text = '';
  try {
    text = readFileSync(FILE, 'utf8');
  } catch {
    return { externalIds, barcodes, size: 0 }; // arquivo é opcional
  }
  const lines = text.split('\n').slice(1); // pula o cabeçalho
  for (const line of lines) {
    const [id, barcode] = line.split(';');
    if (id?.trim()) externalIds.add(id.trim());
    if (barcode?.trim()) barcodes.add(barcode.trim());
  }
  return { externalIds, barcodes, size: externalIds.size + barcodes.size };
}

export function isIgnorado(
  ig: Ignorados,
  row: { externalId?: string | null; barcode?: string | null },
): boolean {
  return Boolean(
    (row.externalId && ig.externalIds.has(row.externalId)) ||
      (row.barcode && ig.barcodes.has(row.barcode)),
  );
}
