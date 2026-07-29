import { useCallback, useEffect, useState } from 'react';

/**
 * Rotas por hash, para o botão "voltar" do celular funcionar sem
 * precisar de um router completo:
 *   #/         lista / busca
 *   #/novo     cadastro (aceita ?barcode=... vindo do leitor)
 *   #/p/<id>   edição de um produto
 */
export type Route =
  | { page: 'list' }
  | { page: 'new'; barcode?: string }
  | { page: 'product'; id: string };

function parseHash(hash: string): Route {
  const [path, query] = hash.replace(/^#/, '').split('?');
  if (path === '/novo') {
    const barcode = new URLSearchParams(query ?? '').get('barcode') ?? undefined;
    return { page: 'new', barcode };
  }
  const m = path?.match(/^\/p\/(.+)$/);
  if (m) return { page: 'product', id: m[1]! };
  return { page: 'list' };
}

export function useHashRoute() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((hash: string) => {
    window.location.hash = hash;
  }, []);

  return { route, navigate };
}
