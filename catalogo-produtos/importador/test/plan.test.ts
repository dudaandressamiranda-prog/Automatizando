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

  it('categoria diferente da atual gera update; igual não gera', () => {
    const existing = [
      product({ id: 'p1', name: 'Ração A', barcode: '7891111111111', category_id: 'cat-1' }),
      product({ id: 'p2', name: 'Ração B', barcode: '7892222222222', category_id: 'cat-1' }),
    ];
    const plan = buildPlan(
      [
        row({ name: 'Ração A', barcode: '7891111111111', category: 'Rações' }), // igual
        row({ name: 'Ração B', barcode: '7892222222222', category: 'Promoções' }), // muda
      ],
      existing,
      [CAT_RACOES],
      'site_admin',
    );
    expect(plan.unchanged).toBe(1);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]!.changes.categoryName).toBe('Promoções');
    expect(plan.newCategories).toEqual(['Promoções']);
  });
});
