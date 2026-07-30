import { supabase } from './supabase';

/**
 * Erros de token (sessão expirada, corrompida ou com horário fora de
 * sincronia — "JWT issued at future") não são erro de dados: a saída é
 * refazer o login. Detecta a mensagem e, se for isso, encerra a sessão —
 * o app cai sozinho na tela de login, em vez de travar num erro vermelho.
 * Devolve true quando tratou (o chamador não deve mostrar o erro).
 */
export function handleAuthError(message: string | undefined | null): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  const isAuth =
    m.includes('jwt') ||
    m.includes('issued at future') ||
    m.includes('token') ||
    m.includes('expired');
  if (isAuth) void supabase.auth.signOut();
  return isAuth;
}
