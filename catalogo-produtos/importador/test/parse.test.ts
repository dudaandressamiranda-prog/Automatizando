import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFile, toImportRows } from '../src/lib/parse.js';

describe('toImportRows', () => {
  const headers = ['Nome', 'Código de Barras', 'Marca', 'Categoria'];

  it('converte registros e valida código de barras', () => {
    const { rows, warnings } = toImportRows(headers, [
      { Nome: 'Ração X', 'Código de Barras': '7891234567890', Marca: 'ACME', Categoria: 'Rações' },
      { Nome: 'Brinquedo Y', 'Código de Barras': 'sem-ean', Marca: 'ACME', Categoria: '' },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ line: 2, name: 'Ração X', barcode: '7891234567890', category: 'Rações' });
    expect(rows[1]).toMatchObject({ line: 3, barcode: null, category: null });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/código de barras inválido/);
  });

  it('ignora linha sem nome, com aviso', () => {
    const { rows, warnings } = toImportRows(headers, [{ Nome: '  ', Marca: 'ACME' }]);
    expect(rows).toHaveLength(0);
    expect(warnings[0]).toMatch(/sem nome/);
  });

  it('exige coluna de nome', () => {
    expect(() => toImportRows(['Marca'], [])).toThrow(/coluna do nome/);
  });

  it('pula kits: pela coluna de tipo (K) e pelo nome de anúncio', () => {
    const h = ['Nome', 'Tipo do produto'];
    const { rows, warnings, kitsSkipped } = toImportRows(h, [
      { Nome: 'Coleira Ectofend P', 'Tipo do produto': 'S' },
      { Nome: 'Comedouro Neon', 'Tipo do produto': 'V' },
      { Nome: '2 x Coleira Ectofend P', 'Tipo do produto': 'K' },
      { Nome: 'Kit 10 Sabonetes Granado', 'Tipo do produto': 'S' },
      { Nome: '3 Pacotes 6kg', 'Tipo do produto': 'S' },
      { Nome: 'Combo banho e tosa', 'Tipo do produto': '' },
      { Nome: 'Kitten Ração Filhotes', 'Tipo do produto': 'S' }, // "Kit" só como início de palavra não conta
    ]);
    expect(rows.map((r) => r.name)).toEqual(['Coleira Ectofend P', 'Comedouro Neon', 'Kitten Ração Filhotes']);
    expect(kitsSkipped).toBe(4);
    // o kit por coluna K é silencioso; os 3 por nome geram aviso
    expect(warnings).toHaveLength(3);
    expect(warnings[0]).toMatch(/kit\/pacote/);
  });
});

describe('parseFile (CSV)', () => {
  it('lê um CSV com BOM e linhas vazias', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'catalogo-'));
    const file = path.join(dir, 'produtos.csv');
    await writeFile(
      file,
      '﻿Nome,Código de Barras,Marca,Categoria\n' +
        'Ração Golden Adulto,7891234567890,Golden,Rações\n' +
        '\n' +
        'Shampoo Neutro,,Sanol,Higiene\n',
      'utf8',
    );
    const { rows, columnMap } = await parseFile(file);
    expect(columnMap.name).toBe('Nome');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.barcode).toBe('7891234567890');
    expect(rows[1]!.barcode).toBeNull();
  });

  it('rejeita extensão desconhecida', async () => {
    await expect(parseFile('produtos.pdf')).rejects.toThrow(/não suportada/);
  });
});
