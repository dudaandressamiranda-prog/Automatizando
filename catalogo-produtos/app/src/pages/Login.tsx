import { type FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    // O teclado do celular põe maiúscula na primeira letra e o preenchimento
    // automático costuma deixar um espaço no fim — os dois fazem o servidor
    // recusar o endereço como "formato inválido", que é um erro difícil de
    // adivinhar olhando a tela.
    const limpo = email.trim().toLowerCase();
    const { error: err } = await supabase.auth.signInWithPassword({ email: limpo, password });
    setBusy(false);
    if (err) {
      const m = err.message.toLowerCase();
      if (m.includes('invalid login credentials')) {
        setError(
          'Email ou senha incorretos — ou este email ainda não tem acesso criado. ' +
            'Confira com o responsável se a conta já foi cadastrada.',
        );
      } else if (m.includes('validate email') || m.includes('invalid format')) {
        setError('Este email não parece válido. Confira se não faltou o @ ou sobrou espaço.');
      } else if (m.includes('email not confirmed')) {
        setError('Conta criada, mas o email ainda não foi confirmado. Peça ao responsável para confirmar.');
      } else {
        setError(`Não foi possível entrar: ${err.message}`);
      }
    }
  }

  return (
    <div className="login">
      <form onSubmit={onSubmit} className="card login-card">
        <h1>Catálogo de Produtos</h1>
        <p className="muted">Acesso restrito — use o usuário criado no Supabase.</p>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
