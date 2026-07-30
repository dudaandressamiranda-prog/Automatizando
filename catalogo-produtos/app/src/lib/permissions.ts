import { supabase } from './supabase';
import type { StoreId } from './store';

/** Vínculo funcionário → loja (tabela store_members). */
export interface Member {
  email: string;
  store: StoreId;
  updated_at: string;
}

/** Loja atribuída ao usuário logado (null = sem loja definida). */
export async function myAssignedStore(email: string | null): Promise<StoreId | null> {
  if (!email) return null;
  const { data } = await supabase
    .from('store_members')
    .select('store')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  const s = data?.store;
  return s === 'centro' || s === 'eldorado' ? s : null;
}

// ---- gestão (admin) -------------------------------------------------------

export async function listMembers(): Promise<Member[]> {
  const { data, error } = await supabase
    .from('store_members')
    .select('email, store, updated_at')
    .order('email');
  if (error) throw error;
  return (data ?? []) as Member[];
}

export async function setMember(email: string, store: StoreId): Promise<void> {
  const { error } = await supabase
    .from('store_members')
    .upsert({ email: email.trim().toLowerCase(), store }, { onConflict: 'email' });
  if (error) throw error;
}

export async function removeMember(email: string): Promise<void> {
  const { error } = await supabase.from('store_members').delete().eq('email', email.toLowerCase());
  if (error) throw error;
}
