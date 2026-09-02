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

/**
 * Busca pelo código do FORNECEDOR (o `cProd` da nota) em vez do código de
 * barras — para fornecedores como a Bastet/São Pet, cujo site não guarda
 * EAN, mas usa o mesmo código de produto da nota como referência. Casamento
 * é sempre exato: nunca vincula a foto de um código diferente.
 */
export async function buscarFotoPorCodigoFornecedor(codigo: string): Promise<{ image: string; name: string } | null> {
  try {
    const res = await fetch(`/api/foto-fornecedor?codigo=${encodeURIComponent(codigo)}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { image: string; name: string } | null;
    return data?.image ? data : null;
  } catch {
    return null;
  }
}
