import { useEffect, useState } from 'react';
import { type ContaUsuario, definirAdmin, listarContas } from '../lib/admin';
import { listMembers, removeMember, setMember, type Member } from '../lib/permissions';
import { STORES, storeLabel, type StoreId } from '../lib/store';
import { supabase } from '../lib/supabase';

/**
 * Menu de permissões (admin): define qual email atende qual loja. Assim o
 * funcionário entra travado na loja dele — sem escolher, sem risco de errar.
 * O login (email/senha) é criado no painel do Supabase; aqui se define a loja.
 */
export function Permissions() {
  return (
    <main className="content">
      <div className="page-head">
        <a href="#/" className="back">‹ Início</a>
        <h1>Funcionários e lojas</h1>
      </div>
      <Lojas />
      <Administradores />
    </main>
  );
}

function Lojas() {
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
    <section>
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
    </section>
  );
}

/**
 * Quem pode virar admin: qualquer conta com login. A mudança fica gravada
 * na conta (app_metadata), por uma função do banco que só obedece a admin.
 */
function Administradores() {
  const [contas, setContas] = useState<ContaUsuario[]>([]);
  const [eu, setEu] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [mexendo, setMexendo] = useState<string | null>(null);

  async function recarregar() {
    try {
      const [lista, sessao] = await Promise.all([listarContas(), supabase.auth.getUser()]);
      setContas(lista);
      setEu(sessao.data.user?.id ?? null);
      setErro(null);
    } catch (e) {
      const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
      setErro(/admin_listar_usuarios/.test(m) ? 'Falta rodar o SQL de administradores no Supabase.' : m);
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { void recarregar(); }, []);

  async function alternar(c: ContaUsuario) {
    const pergunta = c.admin
      ? `Tirar o acesso de administrador de ${c.email}?`
      : `Tornar ${c.email} administrador(a)? Vai poder cadastrar produtos, mexer em etiquetas, sincronizar com o Tiny e mudar quem é admin.`;
    if (!confirm(pergunta)) return;
    setMexendo(c.id);
    setErro(null);
    try {
      await definirAdmin(c.id, !c.admin);
      setAviso(`${c.email} ${c.admin ? 'deixou de ser' : 'agora é'} admin. Vale quando a pessoa sair e entrar de novo no app.`);
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));
    } finally {
      setMexendo(null);
    }
  }

  return (
    <section className="perm-admins">
      <h2>Administradores</h2>
      <p className="muted review-hint">
        Admin vê a área de Administração inteira e atende as duas lojas. Aparecem aqui só
        as contas com login (e-mail e senha). A mudança vale quando a pessoa sair e entrar
        de novo no app.
      </p>
      {erro && <p className="error">{erro}</p>}
      {aviso && <p className="nf-ok">{aviso}</p>}
      {carregando && <p className="muted center-msg">Carregando…</p>}
      {contas.length > 0 && (
        <ul className="perm-list">
          {contas.map((c) => (
            <li key={c.id} className="perm-row">
              <span className="perm-email">
                {c.email}
                {c.id === eu && <span className="muted small"> (você)</span>}
              </span>
              {c.admin && <span className="badge perm-store">Admin</span>}
              <button
                className={c.admin ? 'secondary' : 'primary'}
                onClick={() => alternar(c)}
                disabled={mexendo === c.id || (c.admin && c.id === eu)}
                title={c.admin && c.id === eu ? 'Você não pode tirar o seu próprio acesso de admin' : undefined}
              >
                {mexendo === c.id ? '…' : c.admin ? 'Tirar admin' : 'Tornar admin'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
