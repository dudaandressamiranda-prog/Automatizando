import { useEffect, useState } from 'react';
import { PHOTO_BUCKET, supabase } from './supabase';

/** Qualquer coisa com foto (produto da lista ou item de carrinho). */
export interface Photoish {
  photo_path: string | null;
  photo_source_url: string | null;
}

/**
 * URLs assinadas (válidas por 1h) para as fotos que estão no bucket
 * privado — pedidas em lote, 1 chamada para a lista inteira.
 */
export function useSignedUrls(products: Photoish[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const paths = products.map((p) => p.photo_path).filter((x): x is string => Boolean(x));
    if (paths.length === 0) {
      setUrls({});
      return;
    }
    let alive = true;
    supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(paths, 3600)
      .then(({ data }) => {
        if (!alive || !data) return;
        const m: Record<string, string> = {};
        for (const d of data) {
          if (d.path && d.signedUrl) m[d.path] = d.signedUrl;
        }
        setUrls(m);
      });
    return () => {
      alive = false;
    };
  }, [products]);

  return urls;
}

/** Melhor imagem disponível para um produto (bucket assinado > link externo). */
export function photoSrc(p: Photoish, signed: Record<string, string>): string | null {
  if (p.photo_path && signed[p.photo_path]) return signed[p.photo_path];
  return p.photo_source_url || null;
}
