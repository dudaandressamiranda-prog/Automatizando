import { useEffect, useState } from 'react';
import { CartItemCard } from '../components/CartItemCard';
import {
  createCart, deleteCart, getItems, listCarts, removeItem, setItemStatus, useActiveCart,
  type Cart as CartT, type CartItemRow, type ItemStatus,
} from '../lib/cart';
import { photoSrc, useSignedUrls } from '../lib/photos';
import { storeLabel, type StoreId } from '../lib/store';

interface Props {
  store: StoreId;
  email: string | null;
}

/** Carrinhos da loja ativa: cria, escolhe o ativo e vê os itens de cada um. */
export function Cart({ store, email }: Props) {
  const { activeId, setActive } = useActiveCart(store);
  const [carts, setCarts] = useState<CartT[]>([]);
  const [items, setItems] = useState<CartItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [novo, setNovo] = useState('');

  async function reload() {
    try {
      const cs = await listCarts(store);
      setCarts(cs);
      // se o ativo sumiu, escolhe o mais recente
      const eff = cs.find((c) => c.id === activeId)?.id ?? cs[0]?.id ?? null;
      if (eff !== activeId) setActive(eff);
      setItems(eff ? await getItems(eff) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [store, activeId]);

  async function criar() {
    if (!novo.trim()) return;
    const c = await createCart(store, novo, email);
    setNovo('');
    setActive(c.id);
    await reload();
  }

  async function excluir(id: string) {
    if (!confirm('Excluir este carrinho e seus itens?')) return;
    await deleteCart(id);
    if (id === activeId) setActive(null);
    await reload();
  }

  function copiar() {
    const txt = items.map((i) => `${i.name}${i.barcode ? ` (${i.barcode})` : ''}`).join('\n');
    navigator.clipboard?.writeText(txt);
  }

  const active = carts.find((c) => c.id === activeId) ?? null;
  const signed = useSignedUrls(items);
  const nRepostos = items.filter((i) => i.status === 'reposto').length;
  const nNao = items.filter((i) => i.status === 'nao_reposto').length;
  const nPend = items.length - nRepostos - nNao;

  /*
   * Filtro pelos próprios contadores: clicar mostra só aquele grupo, clicar
   * de novo volta a mostrar tudo. Num carrinho de quase cem itens, achar o
   * que ainda falta repor a olho é o trabalho todo.
   */
  const [filtro, setFiltro] = useState<ItemStatus | null>(null);
  const visiveis = filtro ? items.filter((i) => i.status === filtro) : items;

  async function mudarStatus(i: CartItemRow, status: CartItemRow['status'], reason: CartItemRow['reason']) {
    // atualização otimista para a UI responder na hora
    setItems((cur) => cur.map((x) => (x.id === i.id ? { ...x, status, reason } : x)));
    await setItemStatus(i.id, status, reason, email);
  }

  return (
    <main className="content">
      <div className="page-head">
        <a href="#/" className="back">‹ Início</a>
        <h1>Carrinhos — {storeLabel(store)}</h1>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted center-msg">Carregando…</p>}

      <div className="cart-new">
        <input
          type="text"
          placeholder="Nome do novo carrinho (ex.: Pedido semana)…"
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
        />
        <button className="primary" onClick={criar} disabled={!novo.trim()}>Criar</button>
      </div>

      {carts.length > 0 && (
        <div className="cart-tabs">
          {carts.map((c) => (
            <button
              key={c.id}
              className={`chip ${c.id === activeId ? 'active' : ''}`}
              onClick={() => setActive(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {active && (
        <>
          <div className="cart-actions">
            <span className="muted small">
              {items.length} {items.length === 1 ? 'item' : 'itens'}
              {active.created_by ? ` · por ${active.created_by}` : ''}
            </span>
            <span style={{ flex: 1 }} />
            <button className="secondary" onClick={copiar} disabled={items.length === 0}>📋 Copiar</button>
            <button className="danger" onClick={() => excluir(active.id)}>Excluir carrinho</button>
          </div>

          {items.length > 0 && (
            <div className="rep-summary">
              {([
                ['reposto', 'rep-ok', `✓ ${nRepostos} repostos`],
                ['nao_reposto', 'rep-no', `${nNao} não repostos`],
                ['pendente', 'rep-pend', `${nPend} pendentes`],
              ] as [ItemStatus, string, string][]).map(([st, cor, rotulo]) => (
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

          {items.length === 0 ? (
            <p className="muted center-msg">
              Carrinho vazio. Abra uma categoria, marque as bolinhas e salve.
            </p>
          ) : visiveis.length === 0 ? (
            <p className="muted center-msg">Nenhum item nesta situação.</p>
          ) : (
            <ul className="cart-grid">
              {visiveis.map((i) => (
                <CartItemCard
                  key={i.id}
                  item={i}
                  src={photoSrc(i, signed)}
                  editable
                  onChange={(st, rs) => mudarStatus(i, st, rs)}
                  onRemove={async () => { await removeItem(i.id); await reload(); }}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {!loading && carts.length === 0 && (
        <p className="muted center-msg">Nenhum carrinho ainda. Crie o primeiro acima.</p>
      )}
    </main>
  );
}
