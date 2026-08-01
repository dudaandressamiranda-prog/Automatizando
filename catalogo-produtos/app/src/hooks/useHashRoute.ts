import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Rotas por hash, para o botão "voltar" do celular funcionar sem
 * precisar de um router completo:
 *   #/?q=...   início: busca + categorias
 *   #/c/<nome> categoria (nome do grupo, URL-encoded)
 *   #/revisao  produtos sem código de barras (desativados) — admin
 *   #/prateleira cadastros sem foto ou sem código — admin
 *   #/logs     atividade recente do catálogo — admin
 *   #/novo     cadastro (aceita ?barcode=... vindo do leitor) — admin
 *   #/p/<id>   edição de um produto
 */
export type Route =
  | { page: 'list'; q?: string }
  | { page: 'category'; group: string; sub?: string }
  | { page: 'cart' }
  | { page: 'cartsAdmin'; loja?: string; carrinho?: string }
  | { page: 'permissions' }
  | { page: 'categories' }
  | { page: 'labels' }
  | { page: 'nota' }
  | { page: 'review' }
  | { page: 'pendencias' }
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
  if (path === '/carrinhos-lojas') {
    const q = new URLSearchParams(query ?? '');
    return { page: 'cartsAdmin', loja: q.get('loja') ?? undefined, carrinho: q.get('carrinho') ?? undefined };
  }
  if (path === '/funcionarios') return { page: 'permissions' };
  if (path === '/categorias') return { page: 'categories' };
  if (path === '/etiquetas') return { page: 'labels' };
  if (path === '/nota') return { page: 'nota' };
  if (path === '/revisao') return { page: 'review' };
  if (path === '/prateleira') return { page: 'pendencias' };
  if (path === '/logs') return { page: 'logs' };
  const p = path?.match(/^\/p\/(.+)$/);
  if (p) return { page: 'product', id: p[1]! };
  const c = path?.match(/^\/c\/(.+)$/);
  if (c) {
    const sub = new URLSearchParams(query ?? '').get('sub') ?? undefined;
    return { page: 'category', group: decodeURIComponent(c[1]!), sub };
  }
  // a busca fica na URL para sobreviver a abrir um produto e voltar
  return { page: 'list', q: new URLSearchParams(query ?? '').get('q') ?? undefined };
}

export function useHashRoute() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  /**
   * De onde viemos. Serve para o formulário devolver a pessoa à tela em que
   * ela estava depois de salvar — quem edita um produto dentro de uma
   * categoria quer voltar para aquela categoria, não para o início.
   */
  const anterior = useRef<string | null>(null);

  useEffect(() => {
    const onChange = (e: HashChangeEvent) => {
      const veio = new URL(e.oldURL).hash;
      // ida e volta entre dois produtos não conta como origem: senão, salvar
      // devolveria para o produto anterior em vez da lista
      const paraProduto = window.location.hash.startsWith('#/p/');
      const veioDeProduto = veio.startsWith('#/p/');
      if (!(paraProduto && veioDeProduto)) anterior.current = veio || null;
      setRoute(parseHash(window.location.hash));
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((hash: string) => {
    window.location.hash = hash;
  }, []);

  /**
   * Volta para a tela de origem. Sem origem conhecida — abriu o link direto,
   * recarregou a página — cai no início, que é o único destino garantido.
   */
  const voltar = useCallback(() => {
    window.location.hash = anterior.current ?? '#/';
  }, []);

  return { route, navigate, voltar };
}
