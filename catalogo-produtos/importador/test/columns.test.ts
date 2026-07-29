import { describe, expect, it } from 'vitest';
import { detectColumns } from '../src/lib/columns.js';

describe('detectColumns', () => {
  it('reconhece cabeçalhos comuns em português', () => {
    const { map, unmatched } = detectColumns(['Código de Barras', 'Nome', 'Marca', 'Categoria', 'Estoque', 'Preço']);
    expect(map.barcode).toBe('Código de Barras');
    expect(map.name).toBe('Nome');
    expect(map.brand).toBe('Marca');
    expect(map.category).toBe('Categoria');
    expect(map.stock).toBe('Estoque');
    expect(unmatched).toEqual(['Preço']);
  });

  it('SKU nunca vira external_id (no ERP ele tem "x"/letras nas variações)', () => {
    const { map } = detectColumns(['Produto', 'SKU', 'GTIN']);
    expect(map.externalId).toBeUndefined();
    expect(map.sku).toBe('SKU');
    expect(map.barcode).toBe('GTIN');
  });

  it('não confunde "Código" (id) com "Código de Barras"', () => {
    const { map } = detectColumns(['Código', 'Código de Barras', 'Produto']);
    expect(map.barcode).toBe('Código de Barras');
    expect(map.externalId).toBe('Código');
    expect(map.name).toBe('Produto');
  });

  it('override manual tem prioridade sobre a detecção', () => {
    const { map } = detectColumns(['Descrição', 'Nome Fantasia'], { name: 'Nome Fantasia' });
    expect(map.name).toBe('Nome Fantasia');
  });

  it('erro claro quando o override não existe na planilha', () => {
    expect(() => detectColumns(['Nome'], { barcode: 'EAN' })).toThrow(/não existe/);
  });
});
