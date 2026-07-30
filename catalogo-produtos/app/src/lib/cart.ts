import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { StoreId } from './store';

/** Um carrinho (lista) de uma loja. */
export interface Cart {
  id: string;
  store: StoreId;
  name: string;
  created_by: string | null;
  status: 'aberto' | 'finalizado';
  created_at: string;
}

export type ItemStatus = 'pendente' | 'reposto' | 'nao_reposto';
export type ItemReason = 'fora_estoque' | 'descontinuado' | 'aguardando';

/** Rótulos das situações de reposição (usados na UI). */
export const REASON_LABEL: Record<ItemReason, string> = {
  fora_estoque: 'Fora de estoque',
  descontinuado: 'Não trabalhamos mais',
  aguardando: 'Aguardando reposição',
};

/** Item de carrinho já com dados do produto para exibir. */
export interface CartItemRow {
  id: string;
  product_id: string;
  added_by: string | null;
  added_at: string;
  status: ItemStatus;
  reason: ItemReason | null;
  resolved_by: string | null;
  name: string;
  barcode: string | null;
  photo_path: string | null;
  photo_source_url: string | null;
}

export interface NewItem {
  id: string; // product_id
  name: string;
  barcode: string | null;
}

const activeKey = (store: StoreId) => `catalogo.activeCart.${store}`;

// ---- operações no banco (RLS cuida do acesso por loja) --------------------

export async function listCarts(store: StoreId): Promise<Cart[]> {
  const { data, error } = await supabase
    .from('carts')
    .select('id, store, name, created_by, status, created_at')
    .eq('store', store)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Cart[];
}

/** Todos os carrinhos das duas lojas (uso do admin). */
export async function listAllCarts(): Promise<Cart[]> {
  const { data, error } = await supabase
    .from('carts')
    .select('id, store, name, created_by, status, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Cart[];
}

export async function createCart(store: StoreId, name: string, email: string | null): Promise<Cart> {
  const { data, error } = await supabase
    .from('carts')
    .insert({ store, name: name.trim(), created_by: email })
    .select('id, store, name, created_by, status, created_at')
    .single();
  if (error) throw error;
  return data as Cart;
}

export async function deleteCart(id: string): Promise<void> {
  const { error } = await supabase.from('carts').delete().eq('id', id);
  if (error) throw error;
}

export async function getItems(cartId: string): Promise<CartItemRow[]> {
  const { data, error } = await supabase
    .from('cart_items')
    .select('id, product_id, added_by, added_at, status, reason, resolved_by, products(name, barcode, photo_path, photo_source_url)')
    .eq('cart_id', cartId)
    .order('added_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => {
    const prod = r.products as
      | { name?: string; barcode?: string | null; photo_path?: string | null; photo_source_url?: string | null }
      | null;
    return {
      id: r.id as string,
      product_id: r.product_id as string,
      added_by: (r.added_by as string | null) ?? null,
      added_at: r.added_at as string,
      status: ((r.status as ItemStatus | null) ?? 'pendente'),
      reason: (r.reason as ItemReason | null) ?? null,
      resolved_by: (r.resolved_by as string | null) ?? null,
      name: prod?.name ?? '(produto removido)',
      barcode: prod?.barcode ?? null,
      photo_path: prod?.photo_path ?? null,
      photo_source_url: prod?.photo_source_url ?? null,
    };
  });
}

export async function addItems(cartId: string, items: NewItem[], email: string | null): Promise<void> {
  if (items.length === 0) return;
  const rows = items.map((i) => ({ cart_id: cartId, product_id: i.id, added_by: email }));
  // ignoreDuplicates: remarcar um produto já no carrinho não gera erro
  const { error } = await supabase.from('cart_items').upsert(rows, {
    onConflict: 'cart_id,product_id',
    ignoreDuplicates: true,
  });
  if (error) throw error;
}

export async function removeItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('cart_items').delete().eq('id', itemId);
  if (error) throw error;
}

/** Marca a reposição de um item: reposto, não reposto (com motivo) ou pendente. */
export async function setItemStatus(
  itemId: string,
  status: ItemStatus,
  reason: ItemReason | null,
  email: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('cart_items')
    .update({
      status,
      reason: status === 'nao_reposto' ? reason : null,
      resolved_by: status === 'pendente' ? null : email,
      resolved_at: status === 'pendente' ? null : new Date().toISOString(),
    })
    .eq('id', itemId);
  if (error) throw error;
}

// ---- carrinho "ativo" no aparelho (preferência de UI) ---------------------

export function useActiveCart(store: StoreId | null) {
  const [id, setId] = useState<string | null>(() =>
    store ? localStorage.getItem(activeKey(store)) : null,
  );

  useEffect(() => {
    setId(store ? localStorage.getItem(activeKey(store)) : null);
  }, [store]);

  const set = useCallback(
    (cartId: string | null) => {
      if (!store) return;
      if (cartId) localStorage.setItem(activeKey(store), cartId);
      else localStorage.removeItem(activeKey(store));
      setId(cartId);
    },
    [store],
  );

  return { activeId: id, setActive: set };
}

/**
 * Salva itens no carrinho ATIVO da loja. Se ainda não há carrinho ativo,
 * cria um automaticamente ("Carrinho de <data>"). Usado tanto pelo botão
 * de salvar da categoria quanto pelo pop-up ao sair.
 */
export function useCartSaver(store: StoreId | null, email: string | null) {
  const { activeId, setActive } = useActiveCart(store);

  const save = useCallback(
    async (items: NewItem[]): Promise<void> => {
      if (!store || items.length === 0) return;
      let cid = activeId;
      if (!cid) {
        const nome = `Carrinho de ${new Date().toLocaleDateString('pt-BR')}`;
        const c = await createCart(store, nome, email);
        cid = c.id;
        setActive(cid);
      }
      await addItems(cid, items, email);
    },
    [store, email, activeId, setActive],
  );

  return { save, activeId, setActive };
}
