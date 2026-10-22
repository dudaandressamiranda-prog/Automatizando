// Rode com: npm test (dentro de catalogo-produtos/app)
import test from 'node:test';
import assert from 'node:assert/strict';
import zxing from '@zxing/library';
import { code128Modulos, code128Zpl } from '../src/lib/code128.ts';
import { simbologia } from '../src/lib/codigoBarras.ts';
import { gerarEpl } from '../src/lib/epl.ts';
import { FORMATOS, gerarZpl } from '../src/lib/zpl.ts';

const { Code128Reader, BitArray } = zxing as unknown as {
  Code128Reader: new () => { decodeRow(n: number, row: unknown, hints: Map<unknown, unknown>): { getText(): string } };
  BitArray: new (n: number) => { set(i: number): void };
};

/** Decodifica as barras com o leitor da ZXing — o mesmo que o app usa no iPhone. */
function ler(bits: string): string {
  const comMargem = '0'.repeat(20) + bits + '0'.repeat(20);
  const linha = new BitArray(comMargem.length);
  for (let i = 0; i < comMargem.length; i++) if (comMargem[i] === '1') linha.set(i);
  return new Code128Reader().decodeRow(0, linha, new Map()).getText();
}

test('o leitor devolve exatamente os números da etiqueta', () => {
  // EAN de gerador externo com dígito verificador errado (o certo seria ...2221)
  assert.equal(ler(code128Modulos('7890001112220')), '7890001112220');
  assert.equal(ler(code128Modulos('789000111222')), '789000111222');
  assert.equal(ler(code128Modulos('00000000000000')), '00000000000000');
});

test('todos os pares do subconjunto C e o dígito final pelo B', () => {
  for (let n = 0; n < 100; n++) {
    const c = String(n).padStart(2, '0') + String(n % 10);
    assert.equal(ler(code128Modulos(c)), c);
  }
});

test('ZPL abre no subconjunto C e passa para o B no dígito ímpar', () => {
  assert.equal(code128Zpl('7890001112220'), '>;789000111222>60');
  assert.equal(code128Zpl('78900011122201'), '>;78900011122201');
});

test('etiqueta: EAN-13 válido continua EAN-13, o inválido sai em Code 128 com o número exato', () => {
  const formato = FORMATOS.find((f) => f.id === '33x21x3')!;
  const itens = [
    { nome: 'Válido', barcode: '7891234567895', copias: 1 },
    { nome: 'Gerador externo', barcode: '7890001112220', copias: 1 },
  ];
  const zpl = gerarZpl(itens, { formato });
  assert.match(zpl, /\^BEN,[^\n]*\n\^FD789123456789\^FS/);
  assert.match(zpl, /\^BCN,[^\n]*\n\^FD>;789000111222>60\^FS/);
  // nunca manda o inválido como EAN — a impressora trocaria o último dígito
  assert.doesNotMatch(zpl, /\^FD789000111222\^FS/);

  const epl = gerarEpl(itens, { formato });
  assert.match(epl, /,E30,[^\n]*"789123456789"/);
  assert.match(epl, /,1,2,4,[^\n]*"7890001112220"/);
});

test('escolha entre EAN-13 e Code 128', () => {
  assert.equal(simbologia('7891234567895'), 'ean13');
  assert.equal(simbologia('7890001112220'), 'code128');
  assert.equal(simbologia(' 7890001112220 '), 'code128');
  assert.equal(simbologia('12345'), null);
  assert.equal(simbologia('ABC123'), null);
  assert.equal(simbologia(''), null);
});
