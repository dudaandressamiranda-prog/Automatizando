/**
 * Busca a foto de um produto pelo código de barras, direto na Entrada de
 * nota — mesma ideia do robô de fotos do importador (procurar pelo EAN
 * nas APIs públicas dos grandes pet shops), só que dentro do app, sem
 * precisar rodar nada por fora.
 *
 * Passa pela função /api/foto-por-ean (roda no servidor da Vercel) em vez
 * de chamar a loja direto do navegador: a American Pet não libera CORS
 * para outro site consultar a API dela, e sem esse intermediário metade
 * das buscas falharia sem aviso nenhum.
 */
export interface FotoEncontrada {
  image: string;
  storeName: string;
  shop: string;
}

export async function buscarFotoPorEan(ean: string): Promise<FotoEncontrada | null> {
  try {
    const res = await fetch(`/api/foto-por-ean?ean=${encodeURIComponent(ean)}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as FotoEncontrada | null;
    return data?.image ? data : null;
  } catch {
    return null;
  }
}
