/**
 * Code 128 para códigos numéricos que não são EAN-13 válidos.
 *
 * Existe porque há produto anunciado em marketplace com código de gerador
 * externo cujo dígito verificador não bate com o EAN-13. Como EAN-13 ele
 * não tem saída: a impressora recalcula o 13º dígito (e imprime OUTRO
 * número) e os leitores recusam o dígito errado. O Code 128 não tem regra
 * de dígito — o leitor devolve exatamente os números da etiqueta.
 *
 * Só números: é o que código de produto usa, e assim todo par de dígitos
 * cabe num símbolo do subconjunto C (a etiqueta fica bem mais estreita).
 */
import type { BarcodeSvgOpts } from './ean';

// Larguras alternadas barra/espaço de cada símbolo (valores 0 a 106).
const PADROES = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const CODE_B = 100;
const START_C = 105;
const STOP = 106;

/** Símbolos de dados: pares no subconjunto C; dígito ímpar no fim vai pelo B. */
function valores(digitos: string): number[] {
  if (!/^\d+$/.test(digitos)) throw new Error(`Code 128 aqui só aceita números: "${digitos}"`);
  const v = [START_C];
  const pares = digitos.length - (digitos.length % 2);
  for (let i = 0; i < pares; i += 2) v.push(Number(digitos.slice(i, i + 2)));
  // no subconjunto B o caractere vale o código ASCII menos 32
  if (pares < digitos.length) v.push(CODE_B, digitos.charCodeAt(pares) - 32);
  return v;
}

/** Barras (1) e espaços (0), já com o símbolo de checagem e o de parada. */
export function code128Modulos(digitos: string): string {
  const v = valores(digitos);
  const soma = v.reduce((s, x, i) => s + x * Math.max(1, i), 0);
  let bits = '';
  for (const x of [...v, soma % 103, STOP]) {
    const larguras = PADROES[x]!;
    for (let i = 0; i < larguras.length; i++) bits += (i % 2 === 0 ? '1' : '0').repeat(Number(larguras[i]));
  }
  return bits;
}

/**
 * Dados para o ^BC do ZPL com os subconjuntos escolhidos à mão (">;" abre
 * no C, ">6" passa para o B) — o mesmo plano de `code128Modulos`, então a
 * largura calculada aqui é a que a impressora desenha.
 */
export function code128Zpl(digitos: string): string {
  const pares = digitos.length - (digitos.length % 2);
  return '>;' + digitos.slice(0, pares) + (pares < digitos.length ? '>6' + digitos.slice(pares) : '');
}

export function code128Svg(digitos: string, opts: BarcodeSvgOpts = {}): string {
  const m = opts.modulo ?? 2;
  const h = opts.altura ?? 60;
  const numeros = opts.numeros ?? true;
  const bits = code128Modulos(digitos);
  const margem = 10 * m; // zona de silêncio do padrão
  const larguraTotal = bits.length * m + margem * 2;
  const alturaTexto = numeros ? 14 : 0;
  const alturaTotal = h + alturaTexto + 4;

  let barras = '';
  for (let i = 0; i < bits.length; ) {
    if (bits[i] !== '1') { i++; continue; }
    let fim = i;
    while (bits[fim] === '1') fim++;
    barras += `<rect x="${margem + i * m}" y="0" width="${(fim - i) * m}" height="${h}"/>`;
    i = fim;
  }
  const texto = numeros
    ? `<text x="${larguraTotal / 2}" y="${h + alturaTexto}" font-size="${Math.max(9, m * 5)}" text-anchor="middle" font-family="monospace">${digitos}</text>`
    : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${larguraTotal}" height="${alturaTotal}" viewBox="0 0 ${larguraTotal} ${alturaTotal}">` +
    `<rect width="100%" height="100%" fill="#fff"/><g fill="#000">${barras}</g>${texto}</svg>`
  );
}
