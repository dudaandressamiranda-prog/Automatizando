/**
 * Qual desenho de código de barras usar para cada código do catálogo.
 *
 * EAN-13 válido sai como EAN-13. Qualquer outro código numérico (dígito
 * verificador errado, UPC de 12, código de 8 ou 14 dígitos) sai como
 * Code 128, que o leitor devolve exatamente como está cadastrado — ver
 * `code128.ts`.
 */
// extensão .ts explícita: os testes rodam direto no Node, que não a adivinha
import { code128Svg } from './code128.ts';
import { eanSvg, isValidEan13, type BarcodeSvgOpts } from './ean.ts';

export type Simbologia = 'ean13' | 'code128';

export function simbologia(codigo: string): Simbologia | null {
  const c = codigo.trim();
  if (isValidEan13(c)) return 'ean13';
  // mesma faixa que o app aceita ao cadastrar (cleanBarcode)
  if (/^\d{6,14}$/.test(c)) return 'code128';
  return null;
}

export function codigoSvg(codigo: string, opts: BarcodeSvgOpts = {}): string {
  const c = codigo.trim();
  return simbologia(c) === 'ean13' ? eanSvg(c, opts) : code128Svg(c, opts);
}
