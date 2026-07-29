/**
 * Normalização de texto — cópia da usada no banco (`public.catalog_norm`)
 * e no importador (importador/src/lib/normalize.ts). Se mudar em um lugar,
 * mude nos três.
 */

const ACCENTS = 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ';
const PLAIN = 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn';

export function norm(txt: string | null | undefined): string {
  let out = txt ?? '';
  for (let i = 0; i < ACCENTS.length; i++) {
    out = out.split(ACCENTS[i]!).join(PLAIN[i]!);
  }
  return out.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Limpa um código de barras digitado/escaneado. Retorna null se não for 6–14 dígitos. */
export function cleanBarcode(raw: string): string | null {
  const s = raw.replace(/[\s\-.]/g, '');
  return /^[0-9]{6,14}$/.test(s) ? s : null;
}
