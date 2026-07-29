/**
 * Quem enxerga a área administrativa (cadastrar, revisar, logs).
 *
 * A lista de emails admin vem de VITE_ADMIN_EMAILS (separados por vírgula).
 * Se a variável não estiver definida, o app assume que o único usuário
 * logado é o dono — comportamento certo enquanto só existe um login.
 *
 * ATENÇÃO: isto controla só o que aparece na tela. O bloqueio de verdade
 * (impedir que outro usuário grave via API) é feito no banco, por RLS —
 * necessário quando houver logins de funcionários. Ver README.
 */
const ADMINS = (import.meta.env.VITE_ADMIN_EMAILS as string | undefined ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdmin(email: string | null | undefined): boolean {
  if (ADMINS.length === 0) return true; // sem lista: usuário único = admin
  return Boolean(email && ADMINS.includes(email.toLowerCase()));
}
