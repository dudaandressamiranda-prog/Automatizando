import { type FormEvent, useState } from 'react';
import { entrarSemCadastro } from '../lib/guest';
import { salvarLojaEscolhida, STORES, type StoreId } from '../lib/store';
import { supabase } from '../lib/supabase';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // "Entrar sem cadastro": sem senha, só nome e loja — pensado pra quem
  // está ajudando na loja sem ter conta criada (ex.: cobrindo um turno).
  const [convidado, setConvidado] = useState(false);
  const [nome, setNome] = useState('');
  const [loja, setLoja] = useState<StoreId | null>(null);

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

  async function onSubmitConvidado(e: FormEvent) {
    e.preventDefault();
    const nomeLimpo = nome.trim();
    if (!nomeLimpo || !loja) {
      setError('Digite o nome e escolha a loja para entrar.');
      return;
    }
    setBusy(true);
    setError(null);
    // grava a loja antes do login — assim que a sessão chegar, o app já
    // abre nela, sem passar pela tela de "loja não vinculada"
    salvarLojaEscolhida(loja);
    const { error: err } = await entrarSemCadastro(nomeLimpo);
    setBusy(false);
    if (err) {
      const m = err.message.toLowerCase();
      if (m.includes('anonymous sign-ins are disabled')) {
        setError('Entrada sem cadastro ainda não foi ligada no Supabase — avise o responsável.');
      } else {
        setError(`Não foi possível entrar: ${err.message}`);
      }
    }
  }

  if (convidado) {
    return (
      <div className="login">
        <form onSubmit={onSubmitConvidado} className="card login-card">
          <h1>Entrar sem cadastro</h1>
          <p className="muted">
            Para montar uma lista no carrinho, escreva seu nome — é só pra
            identificar quem pediu cada item.
          </p>
          <label>
            Seu nome
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoFocus
              required
            />
          </label>
          <label>
            Loja
            <div className="login-stores">
              {STORES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`nav-store-btn ${loja === s.id ? 'on' : ''}`}
                  onClick={() => setLoja(s.id)}
                  aria-pressed={loja === s.id}
                >
                  <span aria-hidden>{s.emoji}</span> {s.label.replace('Loja ', '')}
                </button>
              ))}
            </div>
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
          <button
            type="button"
            className="link-muted"
            onClick={() => { setConvidado(false); setError(null); }}
          >
            ‹ Já tenho cadastro
          </button>
        </form>
      </div>
    );
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
        <button
          type="button"
          className="link-muted"
          onClick={() => { setConvidado(true); setError(null); }}
        >
          Entrar sem cadastro
        </button>
      </form>
    </div>
  );
}
