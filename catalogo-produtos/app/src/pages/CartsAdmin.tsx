import { useEffect, useMemo, useState } from 'react';
import { CartItemCard } from '../components/CartItemCard';
import { getItems, listAllCarts, setItemStatus, type Cart, type CartItemRow } from '../lib/cart';
import { photoSrc, useSignedUrls } from '../lib/photos';
import { STORES, storeLabel } from '../lib/store';

interface Props {
  email: string | null;
}

function quando(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Visão do admin: todos os carrinhos das duas lojas, com os itens de cada um. */
export function CartsAdmin({ email }: Props) {
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

  const signed = useSignedUrls(useMemo(() => Object.values(items).flat(), [items]));

  async function mudarStatus(cartId: string, item: CartItemRow, status: CartItemRow['status'], reason: CartItemRow['reason']) {
    setItems((cur) => ({
      ...cur,
      [cartId]: (cur[cartId] ?? []).map((x) => (x.id === item.id ? { ...x, status, reason } : x)),
    }));
    await setItemStatus(item.id, status, reason, email);
  }

  function resumo(rows: CartItemRow[] | undefined): string {
    if (!rows || rows.length === 0) return '';
    const rep = rows.filter((r) => r.status === 'reposto').length;
    const nao = rows.filter((r) => r.status === 'nao_reposto').length;
    return `${rep} repostos · ${nao} não · ${rows.length - rep - nao} pend.`;
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
                    {resumo(items[c.id]) || c.created_by || '—'} · {quando(c.created_at)}
                  </span>
                </button>
                {open === c.id && (
                  <ul className="cart-grid admin-cart-items">
                    {(items[c.id] ?? []).map((i) => (
                      <CartItemCard
                        key={i.id}
                        item={i}
                        src={photoSrc(i, signed)}
                        editable
                        onChange={(st, rs) => mudarStatus(c.id, i, st, rs)}
                      />
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
