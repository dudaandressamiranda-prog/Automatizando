/**
 * EAN-13: cálculo do dígito verificador, geração de código interno e
 * desenho do código de barras.
 *
 * O desenho é feito aqui, à mão, em vez de usar biblioteca: a codificação
 * do EAN-13 é uma tabela pequena e fixa, e assim o app continua servindo
 * etiqueta offline, sem baixar nada.
 */

/** Dígito verificador de um EAN-13, a partir dos 12 primeiros dígitos. */
export function eanCheckDigit(body12: string): number {
  let soma = 0;
  for (let i = 0; i < 12; i++) {
    soma += Number(body12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (soma % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  return eanCheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/** Completa 12 dígitos com o verificador, virando um EAN-13 válido. */
export function completeEan13(body12: string): string {
  const corpo = body12.padStart(12, '0').slice(0, 12);
  return corpo + eanCheckDigit(corpo);
}

/**
 * Faixa reservada para uso interno da loja.
 *
 * O prefixo 2 é o que a GS1 separa para "distribuição restrita" — código
 * que vale dentro do estabelecimento e não pode colidir com o de nenhum
 * fabricante. É por isso que o gerador nunca inventa número em outra
 * faixa: um EAN escolhido no chute pode ser o de um produto de verdade
 * lá fora.
 */
export const PREFIXO_INTERNO = '2';

export function isInternalEan(code: string): boolean {
  return /^2\d{12}$/.test(code);
}

/**
 * Próximo código interno livre, olhando os que já existem. Continua a
 * contagem a partir do maior em uso, então rodar o gerador duas vezes não
 * devolve o mesmo número.
 */
export function nextInternalEan(existentes: string[]): string {
  let maior = 0;
  for (const c of existentes) {
    if (!isInternalEan(c)) continue;
    const seq = Number(c.slice(1, 12)); // 11 dígitos entre o prefixo e o verificador
    if (Number.isFinite(seq) && seq > maior) maior = seq;
  }
  const corpo = PREFIXO_INTERNO + String(maior + 1).padStart(11, '0');
  return completeEan13(corpo);
}

// ---- desenho ------------------------------------------------------------

// Cada dígito vira 7 módulos. A metade esquerda usa os conjuntos L ou G,
// numa ordem definida pelo primeiro dígito; a direita usa sempre o R.
const L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const R = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
const PARIDADE = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];

/** Sequência de barras (1) e espaços (0) de um EAN-13 completo. */
export function eanModules(code13: string): string {
  const d = code13.split('').map(Number);
  const paridade = PARIDADE[d[0]!]!;
  let bits = '101'; // guarda inicial
  for (let i = 1; i <= 6; i++) {
    bits += (paridade[i - 1] === 'L' ? L : G)[d[i]!]!;
  }
  bits += '01010'; // guarda central
  for (let i = 7; i <= 12; i++) {
    bits += R[d[i]!]!;
  }
  bits += '101'; // guarda final
  return bits;
}

export interface BarcodeSvgOpts {
  /** Largura de um módulo, em px. */
  modulo?: number;
  /** Altura das barras, em px. */
  altura?: number;
  /** Mostrar os números embaixo. */
  numeros?: boolean;
}

/**
 * SVG do código de barras, pronto para a tela ou para o papel. As barras
 * de guarda descem um pouco mais que as outras, como manda o padrão.
 */
export function eanSvg(code13: string, opts: BarcodeSvgOpts = {}): string {
  const m = opts.modulo ?? 2;
  const h = opts.altura ?? 60;
  const numeros = opts.numeros ?? true;
  const bits = eanModules(code13);
  const margem = 11 * m; // zona de silêncio exigida pelo padrão
  const larguraTotal = bits.length * m + margem * 2;
  const alturaTexto = numeros ? 14 : 0;
  const alturaTotal = h + alturaTexto + 4;

  // guardas: início (0-2), centro (45-49), fim (92-94)
  const ehGuarda = (i: number) => i <= 2 || (i >= 45 && i <= 49) || i >= 92;

  let barras = '';
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] !== '1') continue;
    const altura = ehGuarda(i) ? h + 5 : h;
    barras += `<rect x="${margem + i * m}" y="0" width="${m}" height="${altura}"/>`;
  }

  let texto = '';
  if (numeros) {
    const y = h + alturaTexto;
    const fonte = Math.max(9, m * 5);
    // 1 dígito à esquerda da guarda, 6 em cada metade
    texto =
      `<text x="${margem - 2}" y="${y}" font-size="${fonte}" text-anchor="end" font-family="monospace">${code13[0]}</text>` +
      `<text x="${margem + 3 * m + 21 * m}" y="${y}" font-size="${fonte}" text-anchor="middle" font-family="monospace">${code13.slice(1, 7)}</text>` +
      `<text x="${margem + 50 * m + 21 * m}" y="${y}" font-size="${fonte}" text-anchor="middle" font-family="monospace">${code13.slice(7)}</text>`;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${larguraTotal}" height="${alturaTotal}" viewBox="0 0 ${larguraTotal} ${alturaTotal}">` +
    `<rect width="100%" height="100%" fill="#fff"/><g fill="#000">${barras}</g>${texto}</svg>`
  );
}
