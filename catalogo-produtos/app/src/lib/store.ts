import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { myAssignedStore } from './permissions';

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
 * Loja em que o usuário vai operar.
 *
 * - Funcionário: loja FIXA vinda da tabela de permissões (store_members) —
 *   não escolhe nem troca, o que elimina o risco de errar a loja.
 * - Admin (isAdmin): sem loja fixa; escolhe qual loja operar (guardado no
 *   aparelho) e pode trocar quando quiser.
 */
export function useActiveStore(session: Session | null, isAdmin: boolean) {
  const email = session?.user.email ?? null;
  const [fixed, setFixed] = useState<StoreId | null>(null);
  const [loading, setLoading] = useState(true);
  const [chosen, setChosen] = useState<StoreId | null>(() => {
    const v = localStorage.getItem(LS_KEY);
    return v === 'centro' || v === 'eldorado' ? v : null;
  });

  useEffect(() => {
    let alive = true;
    // admin não tem loja fixa; funcionário busca a sua na tabela
    if (isAdmin) {
      setFixed(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    myAssignedStore(email).then((s) => {
      if (!alive) return;
      setFixed(s);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [email, isAdmin]);

  const active: StoreId | null = fixed ?? (isAdmin ? chosen : null);

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

  return { active, fixed, loading, choose, clear, canSwitch: isAdmin && !fixed };
}
