import { describe, expect, it } from 'vitest';
import type { ImportRow } from '../src/lib/parse.js';
import { buildPlan, type ExistingCategory, type ExistingProduct } from '../src/lib/plan.js';
import { dedupeKey } from '../src/lib/normalize.js';

let line = 2;
function row(partial: Partial<ImportRow> & { name: string }): ImportRow {
  return {
    line: line++,
    barcode: null,
    brand: null,
    supplier: null,
    category: null,
    externalId: null,
    externalUrl: null,
    photoUrl: 'https://foto.exemplo/p.jpg', // regra: produto novo só entra com foto
    status: null,
    stock: null,
    storeStock: null,
    ...partial,
  };
}

function product(partial: Partial<ExistingProduct> & { id: string; name: string }): ExistingProduct {
  return {
    barcode: null,
    brand: null,
    supplier: null,
    category_id: null,
    source: 'site_admin',
    external_id: null,
    photo_source_url: 'https://foto.exemplo/p.jpg', // igual ao row(): reimportação idêntica não gera mudança
    status: 'ativo',
    dedupe_key: dedupeKey(partial.name, partial.brand ?? null),
    ...partial,
  };
}

const CAT_RACOES: ExistingCategory = { id: 'cat-1', name: 'Rações' };

describe('buildPlan', () => {
  it('base vazia: tudo vira insert e categorias novas são criadas uma vez só', () => {
    const plan = buildPlan(
      [
        row({ name: 'Ração A', barcode: '7891111111111', category: 'Rações' }),
        row({ name: 'Ração B', barcode: '7892222222222', category: 'rações  ' }), // mesma categoria, grafia diferente
        row({ name: 'Shampoo C', category: 'Higiene' }),
      ],
      [],
      [],
      'site_admin',
    );
    expect(plan.inserts).toHaveLength(3);
    expect(plan.updates).toHaveLength(0);
    expect(plan.newCategories).toEqual(['Rações', 'Higiene']);
    expect(plan.warnings).toHaveLength(0);
  });

  it('reimportação idêntica: nada muda', () => {
    const existing = [
      product({ id: 'p1', name: 'Ração A', barcode: '7891111111111', brand: 'Golden', category_id: 'cat-1' }),
    ];
    const plan = buildPlan(
      [row({ name: 'Ração A', barcode: '7891111111111', brand: 'Golden', category: 'Rações' })],
      existing,
      [CAT_RACOES],
      'site_admin',
    );
    expect(plan.inserts).toHaveLength(0);
    expect(plan.updates).toHaveLength(0);
    expect(plan.unchanged).toBe(1);
    expect(plan.newCategories).toHaveLength(0);
  });

  it('casa por external_id antes de qualquer outra coisa', () => {
    const existing = [product({ id: 'p1', name: 'Nome Antigo', external_id: '42' })];
    const plan = buildPlan(
      [row({ name: 'Nome Novo', externalId: '42' })],
      existing,
      [],
      'site_admin',
    );
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]).toMatchObject({ id: 'p1', matchedBy: 'external_id', changes: { name: 'Nome Novo' } });
  });

  it('casa por código de barras e preenche external_id que faltava', () => {
    const existing = [product({ id: 'p1', name: 'Ração A', barcode: '7891111111111' })];
    const plan = buildPlan(
      [row({ name: 'Ração A', barcode: '7891111111111', externalId: '42' })],
      existing,
      [],
      'site_admin',
    );
    expect(plan.updates[0]).toMatchObject({ matchedBy: 'barcode', changes: { external_id: '42' } });
  });

  it('casa por nome+marca quando único e adiciona o código que faltava', () => {
    const existing = [product({ id: 'p1', name: 'Ração A', brand: 'Golden' })];
    const plan = buildPlan(
      [row({ name: 'ração a', brand: 'GOLDEN', barcode: '7891111111111' })],
      existing,
      [],
      'site_admin',
    );
    expect(plan.updates[0]).toMatchObject({ matchedBy: 'name_brand', changes: { barcode: '7891111111111' } });
  });

  it('nome+marca ambíguo (2 candidatos): pula com aviso', () => {
    const existing = [
      product({ id: 'p1', name: 'Ração A', brand: 'Golden', barcode: '7891111111111' }),
      product({ id: 'p2', name: 'Ração A', brand: 'Golden', barcode: '7892222222222' }),
    ];
    const plan = buildPlan([row({ name: 'Ração A', brand: 'Golden' })], existing, [], 'site_admin');
    expect(plan.inserts).toHaveLength(0);
    expect(plan.updates).toHaveLength(0);
    expect(plan.warnings[0]).toMatch(/2 produtos já existem/);
  });

  it('nunca troca um código de barras já cadastrado por outro diferente', () => {
    const existing = [product({ id: 'p1', name: 'Ração A', external_id: '42', barcode: '7891111111111' })];
    const plan = buildPlan(
      [row({ name: 'Ração A', externalId: '42', barcode: '7899999999999' })],
      existing,
      [],
      'site_admin',
    );
    expect(plan.updates).toHaveLength(0);
    expect(plan.unchanged).toBe(1);
    expect(plan.warnings[0]).toMatch(/código NÃO alterado/);
  });

  it('célula vazia não apaga valor existente', () => {
    const existing = [
      product({ id: 'p1', name: 'Ração A', barcode: '7891111111111', brand: 'Golden', supplier: 'Fornecedor X' }),
    ];
    const plan = buildPlan(
      [row({ name: 'Ração A', barcode: '7891111111111' })], // sem marca nem fornecedor
      existing,
      [],
      'site_admin',
    );
    expect(plan.updates).toHaveLength(0);
    expect(plan.unchanged).toBe(1);
  });

  it('duplicata de código de barras dentro do próprio arquivo: segunda linha é pulada', () => {
    const plan = buildPlan(
      [
        row({ name: 'Ração A', barcode: '7891111111111' }),
        row({ name: 'Ração A (repetida)', barcode: '7891111111111' }),
      ],
      [],
      [],
      'site_admin',
    );
    expect(plan.inserts).toHaveLength(1);
    expect(plan.warnings[0]).toMatch(/mesmo código de barras/);
  });

  it('estoque na loja física reativa produto que o ERP marcou inativo', () => {
    // Caso real: areia Pipicat está "Inativo/0" no Tiny (a loja online não
    // vende) e tem 134 unidades no Eldorado. O catálogo serve o balcão.
    const existing = [product({ id: 'p1', name: 'Areia Pipicat 4kg', barcode: '7891111111111', status: 'desativado' })];
    const plan = buildPlan(
      [row({ name: 'Areia Pipicat 4kg', barcode: '7891111111111', status: 'desativado', stock: 0, storeStock: 134 })],
      existing,
      [],
      'site_admin',
    );
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]!.changes.status).toBe('ativo');
  });

  it('sem estoque nas lojas, a situação do ERP continua valendo', () => {
    const existing = [product({ id: 'p1', name: 'Ração X', barcode: '7891111111111', status: 'ativo' })];
    const plan = buildPlan(
      [row({ name: 'Ração X', barcode: '7891111111111', status: 'desativado', stock: 0, storeStock: 0 })],
      existing,
      [],
      'site_admin',
    );
    expect(plan.updates[0]!.changes.status).toBe('desativado');
  });

  it('produto novo inativo no ERP entra se tiver saldo na loja física', () => {
    const plan = buildPlan(
      [row({ name: 'Areia Pipicat 4kg', barcode: '7891111111111', status: 'desativado', stock: 0, storeStock: 55 })],
      [],
      [],
      'site_admin',
    );
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inactiveSkipped).toBe(0);
  });

  it('código repetido no arquivo: vale a ficha ativa com saldo, não a primeira', () => {
    // Caso real do ERP: cadastro antigo (inativo, zerado) e cadastro em uso
    // dividem o mesmo GTIN. Pegar a primeira linha desativava o produto vivo.
    const existing = [product({ id: 'p1', name: 'Guia Marine G', barcode: '7891111111111', status: 'ativo' })];
    const plan = buildPlan(
      [
        row({ name: 'CONJ. GUIA MARINE (antigo)', barcode: '7891111111111', status: 'desativado', stock: 0 }),
        row({ name: 'Guia Marine G', barcode: '7891111111111', status: 'ativo', stock: 4 }),
      ],
      existing,
      [],
      'erp',
    );
    expect(plan.updates).toHaveLength(0); // nome e status já batem com a ficha viva
    expect(plan.unchanged).toBe(1);
    expect(plan.warnings[0]).toMatch(/mais viva no ERP/);
  });

  it('código repetido e fichas igualmente vivas: ganha o nome melhor escrito', () => {
    const plan = buildPlan(
      [
        row({ name: 'CONJ. PEITORAL H E GUIA G MARINE', barcode: '7891111111111', status: 'ativo', stock: 4 }),
        row({ name: 'Conjunto Peitoral H e Guia G Marine', barcode: '7891111111111', status: 'ativo', stock: 4 }),
      ],
      [],
      [],
      'erp',
    );
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0]!.name).toBe('Conjunto Peitoral H e Guia G Marine');
  });

  it('nome melhor escrito não passa por cima da ficha mais viva', () => {
    const plan = buildPlan(
      [
        row({ name: 'Conjunto Peitoral H e Guia G Marine', barcode: '7891111111111', status: 'desativado', stock: 0 }),
        row({ name: 'CONJ. PEITORAL H E GUIA G MARINE', barcode: '7891111111111', status: 'ativo', stock: 4 }),
      ],
      [],
      [],
      'erp',
    );
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0]!.name).toBe('CONJ. PEITORAL H E GUIA G MARINE');
  });

  it('código repetido e produto no banco desativado: a ficha viva reativa', () => {
    const existing = [product({ id: 'p1', name: 'Guia Marine G', barcode: '7891111111111', status: 'desativado' })];
    const plan = buildPlan(
      [
        row({ name: 'CONJ. GUIA MARINE (antigo)', barcode: '7891111111111', status: 'desativado', stock: 0 }),
        row({ name: 'Guia Marine G', barcode: '7891111111111', status: 'ativo', stock: 4 }),
      ],
      existing,
      [],
      'erp',
    );
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]!.changes.status).toBe('ativo');
  });

  it('categoria do ERP só preenche produto sem categoria (curadoria manual vence)', () => {
    const existing = [
      product({ id: 'p1', name: 'Ração A', barcode: '7891111111111', category_id: 'cat-1' }), // já tem
      product({ id: 'p2', name: 'Ração B', barcode: '7892222222222', category_id: null }), // sem categoria
    ];
    const plan = buildPlan(
      [
        row({ name: 'Ração A', barcode: '7891111111111', category: 'Promoções' }), // NÃO troca
        row({ name: 'Ração B', barcode: '7892222222222', category: 'Rações' }), // preenche
      ],
      existing,
      [CAT_RACOES],
      'site_admin',
    );
    expect(plan.unchanged).toBe(1); // Ração A intocada
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]!.changes.categoryName).toBe('Rações');
    expect(plan.newCategories).toEqual([]); // "Promoções" NÃO é criada (ninguém usa)
  });
});

describe('regra: produto novo só entra com foto', () => {
  it('barra insert sem foto por padrão, mas atualiza produto existente normalmente', () => {
    const existente = product({ id: 'p1', name: 'Ração A', barcode: '7891111111111' });
    const plan = buildPlan(
      [
        row({ name: 'Ração A', barcode: '7891111111111', brand: 'ACME', photoUrl: null }), // update: passa
        row({ name: 'Produto Novo Sem Foto', barcode: '7892222222222', photoUrl: null }),  // insert: barrado
        row({ name: 'Produto Novo Com Foto', barcode: '7893333333333' }),                  // insert: entra
      ],
      [existente],
      [],
      'erp',
    );
    expect(plan.inserts.map((i) => i.name)).toEqual(['Produto Novo Com Foto']);
    expect(plan.noPhotoSkipped).toBe(1);
    expect(plan.updates).toHaveLength(1);
  });

  it('--incluir-sem-foto (requirePhoto: false) deixa entrar', () => {
    const plan = buildPlan(
      [row({ name: 'Sem Foto Mesmo', barcode: '7894444444444', photoUrl: null })],
      [],
      [],
      'erp',
      { requirePhoto: false },
    );
    expect(plan.inserts).toHaveLength(1);
    expect(plan.noPhotoSkipped).toBe(0);
  });
});

describe('regra: produto novo só entra com estoque', () => {
  it('barra insert com estoque zerado em todas as lojas; atualiza existente normalmente', () => {
    const existente = product({ id: 'p1', name: 'Ração A', barcode: '7891111111111' });
    const plan = buildPlan(
      [
        row({ name: 'Ração A', barcode: '7891111111111', brand: 'ACME', stock: 0 }), // update: passa
        row({ name: 'Parado Sem Saldo', barcode: '7892222222222', stock: 0 }),       // insert: barrado
        row({ name: 'Tem Saldo', barcode: '7893333333333', stock: 5 }),              // insert: entra
        row({ name: 'Planilha Sem Coluna', barcode: '7894444444444', stock: null }), // insert: entra
      ],
      [existente],
      [],
      'erp',
    );
    expect(plan.inserts.map((i) => i.name)).toEqual(['Tem Saldo', 'Planilha Sem Coluna']);
    expect(plan.noStockSkipped).toBe(1);
    expect(plan.updates).toHaveLength(1);
  });
});
