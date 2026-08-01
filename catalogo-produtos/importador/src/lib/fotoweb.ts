/**
 * Procura a foto de um produto pelo código de barras.
 *
 * As grandes lojas de pet rodam VTEX, que expõe uma busca pública por EAN.
 * Como o EAN é o mesmo produto físico em qualquer loja, a foto que vem de
 * lá é do item certo — desde que o EAN devolvido bata exatamente com o
 * nosso, que é a única checagem que separa "achou" de "achou parecido".
 */
import { classifyByStorePath } from './storecat.js';

/** Lojas com API pública de catálogo (VTEX) consultável por EAN. */
export const SHOPS = ['www.americanpet.com.br', 'www.cobasi.com.br'];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export interface Hit {
  image: string;
  storeName: string;
  /** Categoria que a loja usa para esse EAN — 2ª evidência da classificação. */
  storeCategory: string | null;
  shop: string;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function vtexByEan(shop: string, ean: string): Promise<Hit | null> {
  const url = `https://${shop}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return null;
  }
  if (!Array.isArray(data)) return null;
  for (const prod of data) {
    for (const item of prod.items ?? []) {
      // só aceita se o EAN da loja bate exatamente com o nosso
      if (item.ean === ean || prod.productReference === ean) {
        const image = item.images?.[0]?.imageUrl;
        if (image) {
          const storeCategory =
            (prod.categories ?? [])
              .map((c: string) => classifyByStorePath(c))
              .find((c: string | null) => c) ?? null;
          return { image, storeName: prod.productName, storeCategory, shop };
        }
      }
    }
  }
  return null;
}

/** Tenta as lojas em ordem, com uma pausa entre elas por educação. */
export async function buscarFoto(ean: string): Promise<Hit | null> {
  for (const shop of SHOPS) {
    const hit = await vtexByEan(shop, ean);
    if (hit) return hit;
    await sleep(400);
  }
  return null;
}
