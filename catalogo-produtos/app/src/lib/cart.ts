import { useCallback, useEffect, useState } from 'react';
import type { StoreId } from './store';

/** Item do carrinho — o mínimo para exibir e depois exportar a lista. */
export interface CartItem {
  id: string;
  name: string;
  barcode: string | null;
}

const key = (store: StoreId) => `catalogo.cart.${store}`;
const EVT = 'catalogo:cart';

function read(store: StoreId): CartItem[] {
  try {
    return JSON.parse(localStorage.getItem(key(store)) ?? '[]') as CartItem[];
  } catch {
    return [];
  }
}
function write(store: StoreId, items: CartItem[]) {
  localStorage.setItem(key(store), JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(EVT));
}

/**
 * Carrinho da loja ativa, guardado no aparelho (localStorage). Cada loja
 * tem sua chave, então o carrinho do Centro não se mistura com o do
 * Eldorado no mesmo dispositivo.
 */
export function useCart(store: StoreId | null) {
  const [items, setItems] = useState<CartItem[]>(() => (store ? read(store) : []));

  useEffect(() => {
    if (!store) return;
    const sync = () => setItems(read(store));
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', sync); // outras abas
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [store]);

  const has = useCallback((id: string) => items.some((i) => i.id === id), [items]);

  const addMany = useCallback(
    (novos: CartItem[]) => {
      if (!store) return;
      const map = new Map(read(store).map((i) => [i.id, i]));
      for (const n of novos) map.set(n.id, n);
      write(store, [...map.values()]);
    },
    [store],
  );

  const remove = useCallback(
    (id: string) => {
      if (!store) return;
      write(store, read(store).filter((i) => i.id !== id));
    },
    [store],
  );

  const clear = useCallback(() => {
    if (store) write(store, []);
  }, [store]);

  return { items, has, addMany, remove, clear };
}
