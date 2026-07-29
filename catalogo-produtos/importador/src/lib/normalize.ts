/**
 * Normalização de texto para comparação/deduplicação.
 *
 * ATENÇÃO: precisa produzir exatamente o mesmo resultado da função SQL
 * `public.catalog_norm` (supabase/migrations/20260729000001_init.sql).
 * Se mudar aqui, mude lá também.
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

/** Mesma chave de deduplicação da coluna gerada `products.dedupe_key`. */
export function dedupeKey(name: string, brand: string | null | undefined): string {
  return `${norm(name)}|${norm(brand)}`;
}

/**
 * Limpa um código de barras vindo da planilha.
 * Aceita 6–14 dígitos (EAN-8/12/13/14 e códigos internos curtos).
 * Retorna null para vazio; lança-se mão do campo `warnings` no plano
 * quando o valor existe mas é inválido.
 */
export function cleanBarcode(raw: string | number | null | undefined):
  | { ok: true; value: string | null }
  | { ok: false; raw: string } {
  if (raw === null || raw === undefined) return { ok: true, value: null };

  // Excel costuma transformar códigos longos em número (às vezes notação científica).
  let s = typeof raw === 'number' ? raw.toFixed(0) : String(raw).trim();
  // "7891234567890.0" exportado como texto — tirar o sufixo ANTES de remover pontos separadores
  s = s.replace(/\.0+$/, '');
  s = s.replace(/[\s\-.]/g, '');
  if (s === '' || s === '0') return { ok: true, value: null };

  if (/^[0-9]{6,14}$/.test(s)) return { ok: true, value: s };
  return { ok: false, raw: String(raw) };
}
