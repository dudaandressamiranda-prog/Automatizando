import { useEffect, useState } from 'react';
import {
  createCart, deleteCart, getItems, listCarts, removeItem, useActiveCart,
  type Cart as CartT, type CartItemRow,
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
              {active.created_by ? ` · criado por ${active.created_by}` : ''}
            </span>
            <span style={{ flex: 1 }} />
            <button className="secondary" onClick={copiar} disabled={items.length === 0}>📋 Copiar</button>
            <button className="danger" onClick={() => excluir(active.id)}>Excluir carrinho</button>
          </div>
          {items.length === 0 ? (
            <p className="muted center-msg">
              Carrinho vazio. Abra uma categoria, marque as bolinhas e salve.
            </p>
          ) : (
            <ul className="cart-grid">
              {items.map((i) => {
                const src = photoSrc(i, signed);
                return (
                  <li key={i.id} className="cart-card">
                    <a href={`#/p/${i.product_id}`} className="cart-card-img">
                      <span aria-hidden>🐾</span>
                      {src && <img src={src} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                    </a>
                    <div className="cart-card-body">
                      <a href={`#/p/${i.product_id}`} className="cart-card-name">{i.name}</a>
                      {i.barcode && <span className="mono tiny muted">{i.barcode}</span>}
                    </div>
                    <button
                      className="cart-del"
                      onClick={async () => { await removeItem(i.id); await reload(); }}
                      aria-label="Remover"
                    >✕</button>
                  </li>
                );
              })}
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
