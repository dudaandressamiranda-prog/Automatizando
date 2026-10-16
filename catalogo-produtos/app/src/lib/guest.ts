import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * "Entrar sem cadastro" — login anônimo do Supabase (signInAnonymously):
 * cria uma sessão de verdade, com token, mas sem e-mail nem senha. O nome
 * digitado vai no user_metadata dessa sessão, pra sobreviver a um F5 sem
 * precisar perguntar de novo.
 *
 * Exige "Allow anonymous sign-ins" ligado em Authentication → Sign In /
 * Providers no painel do Supabase — sem isso o Supabase recusa com
 * "Anonymous sign-ins are disabled".
 */
export async function entrarSemCadastro(nome: string) {
  return supabase.auth.signInAnonymously({ options: { data: { nome: nome.trim() } } });
}

/** Nome digitado por quem entrou sem cadastro — null se não for convidado. */
export function nomeConvidado(session: Session | null): string | null {
  if (!session?.user.is_anonymous) return null;
  const meta = session.user.user_metadata as { nome?: string } | undefined;
  return meta?.nome?.trim() || null;
}
