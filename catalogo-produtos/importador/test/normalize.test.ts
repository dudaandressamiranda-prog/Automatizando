import { describe, expect, it } from 'vitest';
import { cleanBarcode, dedupeKey, norm, isValidEan } from '../src/lib/normalize.js';

describe('norm', () => {
  it('remove acentos, caixa e espaços extras', () => {
    expect(norm('  Ração  Úmida   Gatos ')).toBe('racao umida gatos');
    expect(norm('SHAMPOO NEUTRO')).toBe('shampoo neutro');
    expect(norm('Coleira Antipulgas Ção')).toBe('coleira antipulgas cao');
  });

  it('trata nulos e vazio', () => {
    expect(norm(null)).toBe('');
    expect(norm(undefined)).toBe('');
    expect(norm('   ')).toBe('');
  });
});

describe('dedupeKey', () => {
  it('mesmo formato da coluna gerada no banco', () => {
    expect(dedupeKey('Ração Golden', 'PremieR')).toBe('racao golden|premier');
    expect(dedupeKey('Produto', null)).toBe('produto|');
  });
});

describe('cleanBarcode', () => {
  it('aceita EAN-13 e limpa separadores', () => {
    expect(cleanBarcode('7891234567890')).toEqual({ ok: true, value: '7891234567890' });
    expect(cleanBarcode(' 789.1234.567-890 ')).toEqual({ ok: true, value: '7891234567890' });
  });

  it('trata números vindos do Excel', () => {
    expect(cleanBarcode(7891234567890)).toEqual({ ok: true, value: '7891234567890' });
    expect(cleanBarcode('7891234567890.0')).toEqual({ ok: true, value: '7891234567890' });
  });

  it('vazio e zero viram null (produto sem código)', () => {
    expect(cleanBarcode(null)).toEqual({ ok: true, value: null });
    expect(cleanBarcode('')).toEqual({ ok: true, value: null });
    expect(cleanBarcode('0')).toEqual({ ok: true, value: null });
  });

  it('rejeita valores não numéricos ou fora do tamanho', () => {
    expect(cleanBarcode('ABC123')).toEqual({ ok: false, raw: 'ABC123' });
    expect(cleanBarcode('12345')).toEqual({ ok: false, raw: '12345' });
    expect(cleanBarcode('123456789012345')).toEqual({ ok: false, raw: '123456789012345' });
  });
});

describe('isValidEan', () => {
  it('aceita EANs reais e recusa código interno numérico', () => {
    expect(isValidEan('7891126001070')).toBe(true);  // Alergovet
    expect(isValidEan('8713184128188')).toBe(true);  // Pulvex (prefixo holandês)
    expect(isValidEan('7908275615086')).toBe(true);
    expect(isValidEan('790827561508')).toBe(false);  // SKU truncado do ERP
    expect(isValidEan('1234567890123')).toBe(false); // sequência inventada
    expect(isValidEan('123456')).toBe(false);        // código interno curto
  });
});
