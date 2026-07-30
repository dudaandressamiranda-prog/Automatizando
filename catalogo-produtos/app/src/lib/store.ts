import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

/** As duas lojas. O id é usado como chave do carrinho no aparelho. */
export const STORES = [
  { id: 'centro', label: 'Loja Centro', emoji: '🐾' },
  { id: 'eldorado', label: 'Loja Eldorado', emoji: '🏥' },
] as const;

export type StoreId = (typeof STORES)[number]['id'];

export function storeLabel(id: StoreId | null): string {
  return STORES.find((s) => s.id === id)?.label ?? '';
}

const LS_KEY = 'catalogo.activeStore';

/**
 * Loja do login: fixada em user_metadata.store quando o usuário pertence
 * a uma loja (definido no cadastro do Supabase). Sem isso — caso do admin,
 * que supervisiona as duas — vale a escolha guardada no aparelho.
 */
export function fixedStore(session: Session | null): StoreId | null {
  const s = session?.user.user_metadata?.store;
  return s === 'centro' || s === 'eldorado' ? s : null;
}

export function useActiveStore(session: Session | null) {
  const fixed = fixedStore(session);
  const [chosen, setChosen] = useState<StoreId | null>(() => {
    const v = localStorage.getItem(LS_KEY);
    return v === 'centro' || v === 'eldorado' ? v : null;
  });

  // login com loja fixa sempre manda
  const active: StoreId | null = fixed ?? chosen;

  useEffect(() => {
    if (fixed) localStorage.setItem(LS_KEY, fixed);
  }, [fixed]);

  function choose(id: StoreId) {
    localStorage.setItem(LS_KEY, id);
    setChosen(id);
  }
  function clear() {
    localStorage.removeItem(LS_KEY);
    setChosen(null);
  }

  return { active, fixed, choose, clear, canSwitch: !fixed };
}
