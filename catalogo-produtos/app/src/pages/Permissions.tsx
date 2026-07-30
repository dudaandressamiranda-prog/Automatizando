import { useEffect, useState } from 'react';
import { listMembers, removeMember, setMember, type Member } from '../lib/permissions';
import { STORES, storeLabel, type StoreId } from '../lib/store';

/**
 * Menu de permissões (admin): define qual email atende qual loja. Assim o
 * funcionário entra travado na loja dele — sem escolher, sem risco de errar.
 * O login (email/senha) é criado no painel do Supabase; aqui se define a loja.
 */
export function Permissions() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [store, setStore] = useState<StoreId>('centro');
  const [busy, setBusy] = useState(false);

  async function reload() {
    try {
      setMembers(await listMembers());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void reload(); }, []);

  async function adicionar() {
    const e = email.trim().toLowerCase();
    if (!e) return;
    setBusy(true);
    setError(null);
    try {
      await setMember(e, store);
      setEmail('');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="content">
      <div className="page-head">
        <a href="#/" className="back">‹ Início</a>
        <h1>Funcionários e lojas</h1>
      </div>
      <p className="muted review-hint">
        Defina a loja de cada funcionário pelo email. Ele entra travado nessa
        loja — não escolhe nem troca. Crie o login (email e senha) antes, no
        painel do Supabase (Authentication → Users).
      </p>

      <div className="perm-form">
        <input
          type="email"
          placeholder="email@dofuncionario.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select value={store} onChange={(e) => setStore(e.target.value as StoreId)}>
          {STORES.map((s) => <option key={s.id} value={s.id}>{storeLabel(s.id)}</option>)}
        </select>
        <button className="primary" onClick={adicionar} disabled={busy || !email.trim()}>
          {busy ? 'Salvando…' : 'Salvar'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted center-msg">Carregando…</p>}

      {!loading && members.length === 0 && (
        <p className="muted center-msg">Nenhum funcionário vinculado ainda.</p>
      )}

      {members.length > 0 && (
        <ul className="perm-list">
          {members.map((m) => (
            <li key={m.email} className="perm-row">
              <span className="perm-email">{m.email}</span>
              <span className="badge perm-store">{storeLabel(m.store)}</span>
              <button
                className="cart-del"
                onClick={async () => { if (confirm(`Remover ${m.email}?`)) { await removeMember(m.email); await reload(); } }}
                aria-label="Remover"
              >✕</button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
