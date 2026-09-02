/**
 * Busca a foto de um produto pelo código do FORNECEDOR (o `cProd` da nota
 * fiscal) em vez de pelo código de barras — para fornecedores como a
 * Bastet/São Pet, cujo site (saopet.com.br) não guarda EAN nos dados,
 * mas usa o mesmo código de produto da nota como "Referência" (`sku`).
 *
 * Roda no servidor pelo mesmo motivo do foto-por-ean.ts: evitar CORS e
 * manter a chave de leitura da loja fora do navegador. Casamento é
 * SEMPRE por código exato — nunca por nome parecido — para não vincular
 * a foto errada a um produto.
 *
 * GET /api/foto-fornecedor?codigo=9041-2
 * → { image, name } ou null (nada encontrado)
 */

const SITE = 'saopet.com.br';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

interface Variacao {
  sku: string;
  name: string;
  image: string;
}

const unescapeAttr = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** Todas as variações (tamanho/cor) de produto presentes na página de busca. */
function extrairVariacoes(html: string): Variacao[] {
  const variacoes: Variacao[] = [];
  const re = /onclick="updateProductVariation\((.*?)\)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const obj = JSON.parse(unescapeAttr(m[1]!));
      if (obj.sku && obj.image) {
        variacoes.push({ sku: String(obj.sku), name: String(obj.name ?? ''), image: String(obj.image) });
      }
    } catch {
      // blob de variação corrompido ou de outro widget da página — ignora
    }
  }
  return variacoes;
}

// assinatura solta de propósito: roda no builder da Vercel (@vercel/node),
// que não faz parte do build do app (tsconfig só inclui "src")
export default async function handler(req: any, res: any) {
  const codigo = String(req.query?.codigo ?? '').trim();
  if (!codigo) {
    res.status(400).json({ error: 'Informe o código do fornecedor (?codigo=...).' });
    return;
  }

  const url = `https://${SITE}/index.php?route=product/search&search=${encodeURIComponent(codigo)}`;
  let html: string;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) {
      res.status(200).json(null);
      return;
    }
    html = await r.text();
  } catch {
    res.status(200).json(null);
    return;
  }

  const achado = extrairVariacoes(html).find((v) => v.sku === codigo);
  if (achado) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(200).json({ image: achado.image, name: achado.name });
    return;
  }
  res.status(200).json(null);
}
