import { norm } from './normalize.js';

/** Campos que o importador entende. */
export type Field =
  | 'name'
  | 'barcode'
  | 'brand'
  | 'supplier'
  | 'category'
  | 'externalId'
  | 'externalUrl'
  | 'photoUrl'
  | 'status'
  | 'kind'
  | 'sku'
  | 'stock';

/**
 * Cabeçalhos (normalizados) reconhecidos automaticamente.
 * A ordem importa: o primeiro que casar vence.
 */
const AUTO: Array<[Field, string[]]> = [
  ['barcode', ['codigo de barras', 'cod de barras', 'cod barras', 'codigo barras', 'ean', 'gtin', 'gtin/ean', 'ean/gtin', 'barcode']],
  ['name', ['nome', 'produto', 'nome do produto', 'descricao', 'descricao do produto', 'titulo']],
  ['brand', ['marca', 'fabricante', 'brand']],
  ['supplier', ['fornecedor', 'supplier']],
  ['category', ['categoria', 'categorias', 'category', 'departamento', 'secao']],
  // "sku" fora de propósito: no ERP o SKU ganha "x"/letras nas variações e não
  // identifica o produto — quem identifica é o ID (e o código de barras).
  ['externalId', ['id', 'codigo', 'cod', 'referencia', 'ref', 'slug', 'id do produto']],
  ['externalUrl', ['url', 'link', 'link do produto']],
  ['photoUrl', ['url imagem 1', 'url da imagem', 'url imagem', 'imagem 1', 'imagem', 'foto', 'url da foto', 'link da imagem']],
  ['status', ['situacao', 'status']],
  ['kind', ['tipo do produto', 'tipo do item', 'tipo']],
  // SKU só é usado como último recurso para o código de barras (planilha de
  // estoque do painel, onde o SKU costuma ser o próprio EAN). Nas planilhas do
  // Tiny o SKU tem "x"/letras nas variações e é descartado pela validação.
  ['sku', ['codigo (sku)', 'sku', 'codigo interno']],
  ['stock', ['total', 'estoque total', 'saldo', 'estoque']],
];

export type ColumnMap = Partial<Record<Field, string>>;

/** Nomes das lojas físicas como aparecem no cabeçalho da planilha do painel. */
const LOJAS_FISICAS = ['centro', 'eldorado'];

/**
 * Colunas de estoque das LOJAS FÍSICAS, quando a planilha separa por
 * depósito (ex.: "🐾 Centro (CP)", "🏥 Eldorado (CV)", "📦 Tiny", "Total").
 *
 * O depósito do Tiny fica de fora de propósito: é a loja online, que não
 * vende todo o catálogo. Produto zerado lá pode estar cheio na prateleira —
 * a areia Pipicat, por exemplo, tem 0 no Tiny e 134 no Eldorado.
 */
export function detectStoreColumns(headers: string[]): string[] {
  return headers.filter((h) => {
    const n = norm(h);
    return LOJAS_FISICAS.some((loja) => n.includes(loja));
  });
}

/**
 * Descobre qual coluna da planilha corresponde a cada campo.
 * `overrides` (vindos de --map campo="Coluna") têm prioridade.
 */
export function detectColumns(headers: string[], overrides: ColumnMap = {}): {
  map: ColumnMap;
  unmatched: string[];
} {
  const map: ColumnMap = {};
  const used = new Set<string>();

  for (const [field, header] of Object.entries(overrides) as [Field, string][]) {
    const found = headers.find((h) => norm(h) === norm(header));
    if (!found) throw new Error(`Coluna "${header}" (mapeada para ${field}) não existe na planilha.`);
    map[field] = found;
    used.add(found);
  }

  for (const [field, aliases] of AUTO) {
    if (map[field]) continue;
    const found = headers.find((h) => !used.has(h) && aliases.includes(norm(h)));
    if (found) {
      map[field] = found;
      used.add(found);
    }
  }

  return { map, unmatched: headers.filter((h) => !used.has(h)) };
}
