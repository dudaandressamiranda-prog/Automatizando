/**
 * Busca a foto de um produto pelo código de barras nas APIs públicas
 * (VTEX) dos grandes pet shops — a mesma técnica do robô de fotos do
 * importador (src/lib/fotoweb.ts), só que a serviço da tela de Entrada de
 * nota, direto no app.
 *
 * Roda como função da Vercel, não como fetch direto do navegador: a
 * American Pet não manda cabeçalho de CORS na resposta (conferido na mão),
 * então metade das buscas falharia silenciosamente se o site tentasse
 * chamar a loja direto. Daqui, servidor conversando com servidor, não tem
 * bloqueio de CORS nenhum.
 *
 * GET /api/foto-por-ean?ean=7891234567890
 * → { image, storeName, shop } ou null (nada encontrado)
 */

const LOJAS = ['www.cobasi.com.br', 'www.americanpet.com.br'];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

interface Achado {
  image: string;
  storeName: string;
  shop: string;
}

async function buscarNaLoja(shop: string, ean: string): Promise<Achado | null> {
  const url = `https://${shop}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
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
  for (const prod of data as Array<Record<string, unknown>>) {
    const items = (prod.items as Array<Record<string, unknown>> | undefined) ?? [];
    for (const item of items) {
      if (item.ean === ean || prod.productReference === ean) {
        const imagens = item.images as Array<{ imageUrl?: string }> | undefined;
        const image = imagens?.[0]?.imageUrl;
        if (image) return { image, storeName: String(prod.productName ?? ''), shop };
      }
    }
  }
  return null;
}

// assinatura solta de propósito: a função roda no builder da Vercel
// (@vercel/node), que não faz parte do build do app (tsconfig só inclui
// "src") — não vale a pena instalar os tipos só por causa de dois parâmetros.
export default async function handler(req: any, res: any) {
  const ean = String(req.query?.ean ?? '').trim();
  if (!/^\d{13}$/.test(ean)) {
    res.status(400).json({ error: 'Informe um EAN-13 válido.' });
    return;
  }
  for (const shop of LOJAS) {
    const achado = await buscarNaLoja(shop, ean);
    if (achado) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.status(200).json(achado);
      return;
    }
  }
  res.status(200).json(null);
}
