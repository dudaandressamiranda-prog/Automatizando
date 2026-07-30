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
  noStockSkipped: number; // linhas novas com estoque zerado em todas as lojas
  warnings: string[];
}

export interface PlanOptions {
  /** Produto novo só entra se tiver foto (padrão). Reimportações de produtos já cadastrados atualizam normalmente. */
  requirePhoto?: boolean;
  /** Produto novo só entra se estiver ativo (padrão). Produtos já cadastrados recebem a mudança de situação normalmente. */
  requireActive?: boolean;
  /**
   * Quando a planilha informa estoque, produto novo só entra se houver saldo
   * em alguma loja (padrão) — estoque zerado em todas indica cadastro parado.
   * Planilha sem coluna de estoque não é afetada.
   */
  requireStock?: boolean;
}

/**
 * Nota de "capricho" do nome, usada só para desempatar fichas que dividem o
 * mesmo código de barras. O nome vencedor é o que o cliente vê na tela, então
 * entre dois cadastros igualmente válidos vale o mais bem escrito.
 *
 * Os sinais são os do próprio ERP: cadastro feito com pressa sai TODO EM
 * CAIXA ALTA e cheio de abreviação ("CONJ. PEITORAL H E GUIA G MARINE"),
 * enquanto o cadastro caprichado vem com acentuação e palavras inteiras
 * ("Conjunto Peitoral H e Guia G Marine").
 */
export function qualidadeNome(nome: string): number {
  let nota = 0;
  if (nome !== nome.toUpperCase()) nota += 2; // tem minúscula: não é caixa alta
  if (/[áàâãéêíóôõúüç]/i.test(nome)) nota += 1; // acentuação preservada
  if (!/\b[A-Za-z]{2,6}\.(\s|$)/.test(nome)) nota += 1; // sem abreviação com ponto
  return nota;
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
  const requireStock = options.requireStock ?? true;
  const warnings: string[] = [];
  let noPhotoSkipped = 0;
  let inactiveSkipped = 0;
  let noStockSkipped = 0;

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
  const seenExternal = new Map<string, number>();
  const seenDedupe = new Map<string, number>();

  /**
   * O mesmo código de barras aparece em mais de uma ficha quando o ERP tem
   * cadastro antigo e novo convivendo (ex.: "CONJ. PEITORAL H E GUIA G
   * MARINE" inativo e "GUIA+PEITORAL H MARINE G" ativo com saldo, ambos com
   * o mesmo GTIN). Vale a ficha viva — ativa e com estoque —, não a que
   * aparecer primeiro na planilha, senão o produto entra desativado por
   * causa de um cadastro que ninguém usa mais.
   */
  const vivacidade = (r: ImportRow): number => {
    const ativo = r.status === 'ativo' ? 2 : r.status === null ? 1 : 0;
    const saldo = r.stock !== null && r.stock > 0 ? 1 : 0;
    return ativo * 2 + saldo;
  };
  const melhorPorBarcode = new Map<string, ImportRow>();
  for (const row of rows) {
    if (!row.barcode) continue;
    const atual = melhorPorBarcode.get(row.barcode);
    if (!atual) {
      melhorPorBarcode.set(row.barcode, row);
      continue;
    }
    const dif = vivacidade(row) - vivacidade(atual);
    // Empatadas na "vivacidade", ganha a que está melhor escrita — é o
    // nome que vai aparecer para o cliente na tela.
    if (dif > 0 || (dif === 0 && qualidadeNome(row.name) > qualidadeNome(atual.name))) {
      melhorPorBarcode.set(row.barcode, row);
    }
  }

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
      const melhor = melhorPorBarcode.get(row.barcode)!;
      if (melhor !== row) {
        warnings.push(
          `Linha ${row.line}: mesmo código de barras (${row.barcode}) da linha ${melhor.line} — ` +
            `usada a linha ${melhor.line}, que está mais viva no ERP.`,
        );
        continue;
      }
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

    // categoria só é criada quando alguma linha realmente vai usá-la
    const useCategory = (name: string) => {
      if (!knownCategories.has(norm(name)) && !newCategories.has(norm(name))) {
        newCategories.set(norm(name), name);
      }
    };

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
      // "na prateleira" vale mais que a situação do ERP: o Tiny inativa o
      // que a loja online não vende, mesmo com o produto girando no balcão.
      const naPrateleira = row.storeStock !== null && row.storeStock > 0;
      if (requireActive && row.status && row.status !== 'ativo' && !naPrateleira) {
        inactiveSkipped++;
        continue;
      }
      // quando a planilha separa por depósito, o saldo que conta é o das
      // lojas; o "Total" inclui o depósito da loja online
      const saldo = row.storeStock ?? row.stock;
      if (requireStock && saldo !== null && saldo <= 0) {
        noStockSkipped++;
        continue;
      }
      if (requirePhoto && !row.photoUrl) {
        noPhotoSkipped++;
        continue;
      }
      if (row.category) useCategory(row.category);
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
      const dono = byBarcode.get(row.barcode);
      if (match.barcode && matchedBy !== 'barcode') {
        warnings.push(
          `Linha ${row.line} ("${row.name}"): código da planilha (${row.barcode}) difere do cadastrado ` +
            `(${match.barcode}) — código NÃO alterado, confira manualmente.`,
        );
      } else if (dono && dono.id !== match.id) {
        // O EAN já pertence a outro produto (tipicamente a variação "filho"
        // do mesmo item). Gravar aqui violaria a unicidade do código.
        warnings.push(
          `Linha ${row.line} ("${row.name}"): código ${row.barcode} já pertence a "${dono.name}" ` +
            `— código NÃO atribuído, confira se são o mesmo produto.`,
        );
      } else if (!match.barcode) {
        changes.barcode = row.barcode;
      }
    }
    if (row.brand && norm(row.brand) !== norm(match.brand ?? '')) changes.brand = row.brand;
    if (row.supplier && norm(row.supplier) !== norm(match.supplier ?? '')) changes.supplier = row.supplier;
    // Categoria do ERP só PREENCHE quando o produto ainda não tem —
    // a curadoria manual feita no catálogo vence a planilha.
    if (row.category && !match.category_id) {
      useCategory(row.category);
      changes.categoryName = row.category;
    }
    if (row.externalId && !match.external_id) changes.external_id = row.externalId;
    if (row.externalUrl) changes.external_url = row.externalUrl;
    if (row.photoUrl && row.photoUrl !== match.photo_source_url) changes.photo_source_url = row.photoUrl;

    /*
     * Situação: a planilha que sabe do estoque das lojas manda mais do que a
     * situação do ERP. O Tiny marca "Inativo" o que a loja ONLINE não vende,
     * mas o catálogo serve o balcão — a areia Pipicat está inativa e zerada
     * no Tiny e tem 134 unidades no Eldorado. Ter peça na prateleira é prova
     * de que o produto existe e vende, então reativa.
     */
    const naPrateleira = row.storeStock !== null && row.storeStock > 0;
    if (naPrateleira && match.status === 'desativado') {
      changes.status = 'ativo';
    } else if (row.status && row.status !== match.status) {
      // sem informação de prateleira, segue a situação da planilha
      if (!(row.status !== 'ativo' && naPrateleira)) changes.status = row.status;
    }

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
    noStockSkipped,
    warnings,
  };
}
