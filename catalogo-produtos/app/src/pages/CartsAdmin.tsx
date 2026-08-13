import { useEffect, useMemo, useState } from 'react';
import { CartItemCard } from '../components/CartItemCard';
import { getItems, listAllCarts, setItemQty, setItemStatus, type Cart, type CartItemRow } from '../lib/cart';
import { photoSrc, useSignedUrls } from '../lib/photos';
import { STORES, storeLabel, type StoreId } from '../lib/store';

interface Props {
  email: string | null;
  /** Loja aberta; sem ela, mostra a escolha das duas. */
  loja?: string;
  /** Carrinho aberto; abre a tela dos produtos. */
  carrinho?: string;
}

function quando(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

const porNome = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt-BR');

/**
 * Visão do admin, em três telas: escolhe a loja, vê os carrinhos dela e
 * abre um para trabalhar nos produtos. Cada nível é um endereço próprio,
 * então o botão voltar do celular anda um passo de cada vez.
 */
export function CartsAdmin({ email, loja, carrinho }: Props) {
  const [carts, setCarts] = useState<Cart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [itens, setItens] = useState<CartItemRow[] | null>(null);
  const [carregandoItens, setCarregandoItens] = useState(false);
  /** Clicar num contador mostra só aquele grupo; clicar de novo mostra tudo. */
  const [filtro, setFiltro] = useState<CartItemRow['status'] | null>(null);

  useEffect(() => {
    listAllCarts()
      .then(setCarts)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  // carrega os produtos só do carrinho aberto
  useEffect(() => {
    if (!carrinho) {
      setItens(null);
      return;
    }
    let vivo = true;
    setCarregandoItens(true);
    getItems(carrinho)
      .then((rows) => { if (vivo) setItens(rows); })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (vivo) setCarregandoItens(false); });
    return () => { vivo = false; };
  }, [carrinho]);

  const signed = useSignedUrls(itens ?? []);

  async function mudarQtd(item: CartItemRow, qty: number) {
    const novo = Math.max(1, Math.round(qty) || 1);
    if (novo === item.qty) return;
    setItens((cur) => (cur ?? []).map((x) => (x.id === item.id ? { ...x, qty: novo } : x)));
    await setItemQty(item.id, novo);
  }

  async function mudarStatus(item: CartItemRow, status: CartItemRow['status'], reason: CartItemRow['reason']) {
    setItens((cur) => (cur ?? []).map((x) => (x.id === item.id ? { ...x, status, reason } : x)));
    await setItemStatus(item.id, status, reason, email);
  }

  const porLoja = useMemo(() => {
    const m = new Map<StoreId, Cart[]>();
    for (const s of STORES) {
      m.set(
        s.id,
        carts.filter((c) => c.store === s.id).sort(porNome),
      );
    }
    return m;
  }, [carts]);

  // ---- tela 3: produtos de um carrinho ---------------------------------
  if (carrinho) {
    const c = carts.find((x) => x.id === carrinho);
    const ordenados = [...(itens ?? [])].sort(porNome);
    const reposto = ordenados.filter((i) => i.status === 'reposto').length;
    const naoReposto = ordenados.filter((i) => i.status === 'nao_reposto').length;
    const pendente = ordenados.length - reposto - naoReposto;
    const visiveis = filtro ? ordenados.filter((i) => i.status === filtro) : ordenados;

    return (
      <main className="content">
        <div className="page-head">
          <a href={`#/carrinhos-lojas?loja=${c?.store ?? ''}`} className="back">‹ Carrinhos</a>
          <h1>{c?.name ?? 'Carrinho'}</h1>
          <span className="muted small">{ordenados.length} produtos</span>
        </div>
        {c && (
          <p className="muted small">
            {storeLabel(c.store)} · criado por {c.created_by || '—'} · {quando(c.created_at)}
          </p>
        )}

        {ordenados.length > 0 && (
          <div className="rep-summary">
            {([
              ['reposto', 'rep-ok', `${reposto} repostos`],
              ['nao_reposto', 'rep-no', `${naoReposto} não repostos`],
              ['pendente', 'rep-pend', `${pendente} pendentes`],
            ] as [CartItemRow['status'], string, string][]).map(([st, cor, rotulo]) => (
              <button
                key={st}
                type="button"
                className={`rep-pill ${cor} ${filtro === st ? 'on' : ''}`}
                aria-pressed={filtro === st}
                onClick={() => setFiltro((f) => (f === st ? null : st))}
              >
                {rotulo}
              </button>
            ))}
            {filtro && (
              <button type="button" className="rep-limpar" onClick={() => setFiltro(null)}>
                ✕ mostrar todos
              </button>
            )}
          </div>
        )}

        {error && <p className="error">Erro: {error}</p>}
        {carregandoItens && <p className="muted center-msg">Carregando…</p>}
        {!carregandoItens && ordenados.length === 0 && <p className="muted center-msg">Carrinho vazio.</p>}
        {ordenados.length > 0 && visiveis.length === 0 && (
          <p className="muted center-msg">Nenhum item nesta situação.</p>
        )}

        <ul className="cart-grid">
          {visiveis.map((i) => (
            <CartItemCard
              key={i.id}
              item={i}
              src={photoSrc(i, signed)}
              editable
              onChange={(st, rs) => mudarStatus(i, st, rs)}
              onQty={(q) => mudarQtd(i, q)}
            />
          ))}
        </ul>
      </main>
    );
  }

  // ---- tela 2: carrinhos de uma loja -----------------------------------
  if (loja) {
    const s = STORES.find((x) => x.id === loja);
    const lista = porLoja.get(loja as StoreId) ?? [];
    return (
      <main className="content">
        <div className="page-head">
          <a href="#/carrinhos-lojas" className="back">‹ Lojas</a>
          <h1>{s?.emoji} {storeLabel(loja as StoreId)}</h1>
          <span className="muted small">{lista.length} carrinhos</span>
        </div>

        {error && <p className="error">Erro: {error}</p>}
        {loading && <p className="muted center-msg">Carregando…</p>}
        {!loading && lista.length === 0 && <p className="muted center-msg">Nenhum carrinho nesta loja.</p>}

        <ul className="cart-lista">
          {lista.map((c) => (
            <li key={c.id}>
              <a href={`#/carrinhos-lojas?carrinho=${c.id}`} className="cart-lista-item">
                <span className="cart-lista-nome">🛒 {c.name}</span>
                <span className="muted small">{c.created_by || '—'} · {quando(c.created_at)}</span>
                <span className="cart-lista-seta">›</span>
              </a>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  // ---- tela 1: escolha da loja -----------------------------------------
  return (
    <main className="content">
      <div className="page-head">
        <a href="#/" className="back">‹ Início</a>
        <h1>Carrinhos das lojas</h1>
        <span className="muted small">{carts.length} no total</span>
      </div>

      {error && <p className="error">Erro: {error}</p>}
      {loading && <p className="muted center-msg">Carregando…</p>}

      <div className="loja-botoes">
        {STORES.map((s) => {
          const n = (porLoja.get(s.id) ?? []).length;
          return (
            <a key={s.id} href={`#/carrinhos-lojas?loja=${s.id}`} className="loja-botao">
              <span className="loja-botao-emoji" aria-hidden>{s.emoji}</span>
              <span className="loja-botao-nome">{storeLabel(s.id)}</span>
              <span className="loja-botao-cart">
                🛒 {n} carrinho{n === 1 ? '' : 's'}
              </span>
            </a>
          );
        })}
      </div>
    </main>
  );
}
