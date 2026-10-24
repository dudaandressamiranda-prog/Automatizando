import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * Quem enxerga a área administrativa (cadastrar, revisar, logs).
 *
 * Vale o que está na conta: app_metadata.role = 'admin' — o mesmo que o
 * banco (jwt_is_admin) e as funções do Tiny conferem, e que se liga/desliga
 * em Funcionários e lojas. A pessoa não consegue mexer no próprio
 * app_metadata, então ninguém se promove sozinho.
 *
 * Os emails de VITE_ADMIN_EMAILS continuam admin sempre, como garantia: a
 * dona nunca fica trancada fora se alguém tirar o admin dela no banco.
 *
 * ATENÇÃO: isto controla só o que aparece na tela. O bloqueio de verdade
 * (impedir que outro usuário grave via API) é feito no banco, por RLS.
 */
const ADMINS = (import.meta.env.VITE_ADMIN_EMAILS as string | undefined ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdmin(user: User | null | undefined): boolean {
  if (!user || user.is_anonymous) return false;
  if (user.app_metadata?.role === 'admin') return true;
  return Boolean(user.email && ADMINS.includes(user.email.toLowerCase()));
}

export interface ContaUsuario {
  id: string;
  email: string;
  admin: boolean;
  ultimo_login: string | null;
}

/** Contas com login — só admin consegue listar (função no banco). */
export async function listarContas(): Promise<ContaUsuario[]> {
  const { data, error } = await supabase.rpc('admin_listar_usuarios');
  if (error) throw error;
  return (data ?? []) as ContaUsuario[];
}

/** Liga ou desliga o admin de uma conta. Vale no próximo login dela. */
export async function definirAdmin(id: string, admin: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_definir', { alvo: id, tornar_admin: admin });
  if (error) throw error;
}
