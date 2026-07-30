import { useCart } from '../lib/cart';
import { storeLabel, type StoreId } from '../lib/store';

interface Props {
  store: StoreId;
}

/**
 * Carrinho da loja ativa: a lista que a pessoa montou percorrendo as
 * categorias. Guardado no aparelho, separado por loja.
 */
export function Cart({ store }: Props) {
  const { items, remove, clear } = useCart(store);

  function copiar() {
    const txt = items
      .map((i) => `${i.name}${i.barcode ? ` (${i.barcode})` : ''}`)
      .join('\n');
    navigator.clipboard?.writeText(txt);
  }

  return (
    <main className="content">
      <div className="page-head">
        <a href="#/" className="back">‹ Início</a>
        <h1>Carrinho — {storeLabel(store)}</h1>
        <span className="muted small">{items.length} {items.length === 1 ? 'item' : 'itens'}</span>
      </div>

      {items.length === 0 && (
        <p className="muted center-msg">
          Carrinho vazio. Abra uma categoria, marque as bolinhas dos produtos e salve.
        </p>
      )}

      {items.length > 0 && (
        <>
          <div className="cart-actions">
            <button className="secondary" onClick={copiar}>📋 Copiar lista</button>
            <button className="danger" onClick={() => { if (confirm('Esvaziar o carrinho?')) clear(); }}>
              Esvaziar
            </button>
          </div>
          <ul className="cart-list">
            {items.map((i) => (
              <li key={i.id} className="cart-row">
                <a href={`#/p/${i.id}`} className="cart-name">{i.name}</a>
                {i.barcode && <span className="mono tiny muted">{i.barcode}</span>}
                <button className="cart-del" onClick={() => remove(i.id)} aria-label="Remover">✕</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
