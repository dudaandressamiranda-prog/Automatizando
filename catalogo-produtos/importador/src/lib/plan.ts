import { dedupeKey, norm } from './normalize.js';
import type { ImportRow } from './parse.js';

/** Produto como está hoje no banco (campos que interessam ao importador). */
export interface ExistingProduct {
  id: string;
  name: string;
  barcode: string | null;
  brand: string | null;
  supplier: string | null;
  category_id: string | null;
  source: string;
  external_id: string | null;
  photo_source_url: string | null;
  status: string;
  dedupe_key: string;
}

export interface ExistingCategory {
  id: string;
  name: string;
}

export interface ProductInsert {
  name: string;
  barcode: string | null;
  brand: string | null;
  supplier: string | null;
  categoryName: string | null; // resolvido para category_id na hora de gravar
  source: string;
  external_id: string | null;
  external_url: string | null;
  photo_source_url: string | null;
  status: string | null; // null = usa o padrão do banco ('ativo')
}

export interface ProductUpdate {
  id: string;
  matchedBy: 'external_id' | 'barcode' | 'name_brand';
  changes: Partial<Omit<ProductInsert, 'source'>>;
}

export interface Plan {
  newCategories: string[]; // nomes ainda não existentes (deduplicados por norm)
  inserts: ProductInsert[];
  updates: ProductUpdate[];
  unchanged: number;
  noPhotoSkipped: number; // linhas novas sem foto, barradas (política: catálogo só com foto)
  inactiveSkipped: number; // linhas novas inativas, barradas (política: catálogo só de ativos)
  warnings: string[];
}

export interface PlanOptions {
  /** Produto novo só entra se tiver foto (padrão). Reimportações de produtos já cadastrados atualizam normalmente. */
  requirePhoto?: boolean;
  /** Produto novo só entra se estiver ativo (padrão). Produtos já cadastrados recebem a mudança de situação normalmente. */
  requireActive?: boolean;
}

/**
 * Decide o que fazer com cada linha da planilha, sem tocar no banco.
 *
 * Ordem de casamento com produtos existentes:
 *   1. source + external_id (id do painel admin — o mais confiável)
 *   2. código de barras
 *   3. nome + marca normalizados (dedupe_key) — só quando o casamento é único;
 *      empate vira aviso e a linha é pulada, para não atualizar o produto errado.
 *
 * Política de atualização: valor novo não-vazio sobrescreve o antigo;
 * célula vazia na planilha NUNCA apaga um valor já cadastrado.
 */
export function buildPlan(
  rows: ImportRow[],
  existingProducts: ExistingProduct[],
  existingCategories: ExistingCategory[],
  source: string,
  options: PlanOptions = {},
): Plan {
  const requirePhoto = options.requirePhoto ?? true;
  const requireActive = options.requireActive ?? true;
  const warnings: string[] = [];
  let noPhotoSkipped = 0;
  let inactiveSkipped = 0;

  const byExternal = new Map<string, ExistingProduct>();
  const byBarcode = new Map<string, ExistingProduct>();
  const byDedupe = new Map<string, ExistingProduct[]>();
  for (const p of existingProducts) {
    if (p.external_id) byExternal.set(`${p.source}|${p.external_id}`, p);
    if (p.barcode) byBarcode.set(p.barcode, p);
    const list = byDedupe.get(p.dedupe_key) ?? [];
    list.push(p);
    byDedupe.set(p.dedupe_key, list);
  }

  const categoryIdByNorm = new Map(existingCategories.map((c) => [norm(c.name), c.id]));
  const knownCategories = new Set(categoryIdByNorm.keys());
  const newCategories = new Map<string, string>(); // norm → nome original

  // Dentro da própria planilha também pode haver duplicata.
  const seenBarcode = new Map<string, number>();
  const seenExternal = new Map<string, number>();
  const seenDedupe = new Map<string, number>();

  const inserts: ProductInsert[] = [];
  const updates: ProductUpdate[] = [];
  let unchanged = 0;

  for (const row of rows) {
    // -- duplicatas dentro do arquivo -------------------------------------
    if (row.externalId) {
      const prev = seenExternal.get(row.externalId);
      if (prev !== undefined) {
        warnings.push(`Linha ${row.line}: mesmo ID (${row.externalId}) da linha ${prev} — ignorada.`);
        continue;
      }
      seenExternal.set(row.externalId, row.line);
    }
    if (row.barcode) {
      const prev = seenBarcode.get(row.barcode);
      if (prev !== undefined) {
        warnings.push(`Linha ${row.line}: mesmo código de barras (${row.barcode}) da linha ${prev} — ignorada.`);
        continue;
      }
      seenBarcode.set(row.barcode, row.line);
    }
    if (!row.externalId && !row.barcode) {
      const key = dedupeKey(row.name, row.brand);
      const prev = seenDedupe.get(key);
      if (prev !== undefined) {
        warnings.push(`Linha ${row.line}: mesmo nome+marca da linha ${prev} e sem código — ignorada.`);
        continue;
      }
      seenDedupe.set(key, row.line);
    }

    // -- categoria ---------------------------------------------------------
    if (row.category && !knownCategories.has(norm(row.category)) && !newCategories.has(norm(row.category))) {
      newCategories.set(norm(row.category), row.category);
    }

    // -- casamento com o banco --------------------------------------------
    let match: ExistingProduct | undefined;
    let matchedBy: ProductUpdate['matchedBy'] | undefined;

    if (row.externalId && byExternal.has(`${source}|${row.externalId}`)) {
      match = byExternal.get(`${source}|${row.externalId}`);
      matchedBy = 'external_id';
    } else if (row.barcode && byBarcode.has(row.barcode)) {
      match = byBarcode.get(row.barcode);
      matchedBy = 'barcode';
    } else {
      const candidates = byDedupe.get(dedupeKey(row.name, row.brand)) ?? [];
      if (candidates.length === 1) {
        match = candidates[0];
        matchedBy = 'name_brand';
      } else if (candidates.length > 1) {
        warnings.push(
          `Linha ${row.line} ("${row.name}"): ${candidates.length} produtos já existem com esse nome+marca ` +
            `e a linha não tem código para desempatar — ignorada. Resolva manualmente.`,
        );
        continue;
      }
    }

    if (!match) {
      if (requireActive && row.status && row.status !== 'ativo') {
        inactiveSkipped++;
        continue;
      }
      if (requirePhoto && !row.photoUrl) {
        noPhotoSkipped++;
        continue;
      }
      inserts.push({
        name: row.name,
        barcode: row.barcode,
        brand: row.brand,
        supplier: row.supplier,
        categoryName: row.category,
        source,
        external_id: row.externalId,
        external_url: row.externalUrl,
        photo_source_url: row.photoUrl,
        status: row.status,
      });
      continue;
    }

    // -- diff (vazio nunca apaga) -----------------------------------------
    const changes: ProductUpdate['changes'] = {};
    if (row.name && row.name !== match.name) changes.name = row.name;
    if (row.barcode && row.barcode !== match.barcode) {
      if (match.barcode && matchedBy !== 'barcode') {
        warnings.push(
          `Linha ${row.line} ("${row.name}"): código da planilha (${row.barcode}) difere do cadastrado ` +
            `(${match.barcode}) — código NÃO alterado, confira manualmente.`,
        );
      } else if (!match.barcode) {
        changes.barcode = row.barcode;
      }
    }
    if (row.brand && norm(row.brand) !== norm(match.brand ?? '')) changes.brand = row.brand;
    if (row.supplier && norm(row.supplier) !== norm(match.supplier ?? '')) changes.supplier = row.supplier;
    if (row.category) {
      const catId = categoryIdByNorm.get(norm(row.category));
      // categoria nova, ou diferente da atual do produto
      if (!catId || catId !== match.category_id) changes.categoryName = row.category;
    }
    if (row.externalId && !match.external_id) changes.external_id = row.externalId;
    if (row.externalUrl) changes.external_url = row.externalUrl;
    if (row.photoUrl && row.photoUrl !== match.photo_source_url) changes.photo_source_url = row.photoUrl;
    if (row.status && row.status !== match.status) changes.status = row.status;

    if (Object.keys(changes).length === 0) {
      unchanged++;
    } else {
      updates.push({ id: match.id, matchedBy: matchedBy!, changes });
    }
  }

  return {
    newCategories: [...newCategories.values()],
    inserts,
    updates,
    unchanged,
    noPhotoSkipped,
    inactiveSkipped,
    warnings,
  };
}
