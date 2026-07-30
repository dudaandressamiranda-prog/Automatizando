import { useEffect, useState } from 'react';
import { getItems, listAllCarts, type Cart, type CartItemRow } from '../lib/cart';
import { STORES, storeLabel } from '../lib/store';

function quando(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Visão do admin: todos os carrinhos das duas lojas, com os itens de cada um. */
export function CartsAdmin() {
  const [carts, setCarts] = useState<Cart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, CartItemRow[]>>({});

  useEffect(() => {
    listAllCarts()
      .then(setCarts)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(id: string) {
    if (open === id) return setOpen(null);
    setOpen(id);
    if (!items[id]) {
      const rows = await getItems(id);
      setItems((cur) => ({ ...cur, [id]: rows }));
    }
  }

  return (
    <main className="content">
      <div className="page-head">
        <a href="#/" className="back">‹ Início</a>
        <h1>Carrinhos das lojas</h1>
        <span className="muted small">{carts.length} no total</span>
      </div>

      {error && <p className="error">Erro: {error}</p>}
      {loading && <p className="muted center-msg">Carregando…</p>}

      {STORES.map((s) => {
        const doStore = carts.filter((c) => c.store === s.id);
        return (
          <section key={s.id}>
            <h2 className="section-title">{s.emoji} {storeLabel(s.id)} — {doStore.length}</h2>
            {doStore.length === 0 && <p className="muted small">Nenhum carrinho.</p>}
            {doStore.map((c) => (
              <div key={c.id} className="admin-cart">
                <button className="admin-cart-head" onClick={() => toggle(c.id)}>
                  <span className="admin-cart-name">{open === c.id ? '▾' : '▸'} {c.name}</span>
                  <span className="muted small">
                    {c.created_by ?? '—'} · {quando(c.created_at)}
                  </span>
                </button>
                {open === c.id && (
                  <ul className="cart-list admin-cart-items">
                    {(items[c.id] ?? []).map((i) => (
                      <li key={i.id} className="cart-row">
                        <a href={`#/p/${i.product_id}`} className="cart-name">{i.name}</a>
                        {i.barcode && <span className="mono tiny muted">{i.barcode}</span>}
                        <span className="tiny muted">{i.added_by ?? ''}</span>
                      </li>
                    ))}
                    {(items[c.id] ?? []).length === 0 && <li className="muted small">Vazio.</li>}
                  </ul>
                )}
              </div>
            ))}
          </section>
        );
      })}
    </main>
  );
}
