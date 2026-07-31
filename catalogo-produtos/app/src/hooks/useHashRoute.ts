import { useCallback, useEffect, useState } from 'react';

/**
 * Rotas por hash, para o botão "voltar" do celular funcionar sem
 * precisar de um router completo:
 *   #/         início: busca + categorias
 *   #/c/<nome> categoria (nome do grupo, URL-encoded)
 *   #/revisao  produtos sem código de barras (desativados) — admin
 *   #/logs     atividade recente do catálogo — admin
 *   #/novo     cadastro (aceita ?barcode=... vindo do leitor) — admin
 *   #/p/<id>   edição de um produto
 */
export type Route =
  | { page: 'list' }
  | { page: 'category'; group: string; sub?: string }
  | { page: 'cart' }
  | { page: 'cartsAdmin' }
  | { page: 'permissions' }
  | { page: 'categories' }
  | { page: 'labels' }
  | { page: 'review' }
  | { page: 'logs' }
  | { page: 'new'; barcode?: string }
  | { page: 'product'; id: string };

function parseHash(hash: string): Route {
  const [path, query] = hash.replace(/^#/, '').split('?');
  if (path === '/novo') {
    const barcode = new URLSearchParams(query ?? '').get('barcode') ?? undefined;
    return { page: 'new', barcode };
  }
  if (path === '/carrinho') return { page: 'cart' };
  if (path === '/carrinhos-lojas') return { page: 'cartsAdmin' };
  if (path === '/funcionarios') return { page: 'permissions' };
  if (path === '/categorias') return { page: 'categories' };
  if (path === '/etiquetas') return { page: 'labels' };
  if (path === '/revisao') return { page: 'review' };
  if (path === '/logs') return { page: 'logs' };
  const p = path?.match(/^\/p\/(.+)$/);
  if (p) return { page: 'product', id: p[1]! };
  const c = path?.match(/^\/c\/(.+)$/);
  if (c) {
    const sub = new URLSearchParams(query ?? '').get('sub') ?? undefined;
    return { page: 'category', group: decodeURIComponent(c[1]!), sub };
  }
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
