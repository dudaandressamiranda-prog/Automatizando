import { useEffect, useMemo, useState } from 'react';
import { createCategory, subLevel, topLevel } from '../lib/catalog';
import { supabase } from '../lib/supabase';
import type { Category } from '../lib/types';

/**
 * Menu de categorias (admin): cria categoria nova (nível 1) ou subcategoria
 * dentro de uma já existente, sem precisar mexer no banco na mão.
 */
export function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grupo, setGrupo] = useState('');
  const [sub, setSub] = useState('');
  const [busy, setBusy] = useState(false);

  async function reload() {
    const { data, error: err } = await supabase.from('categories').select('id, name').order('name');
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setCategories(data ?? []);
    setLoading(false);
  }
  useEffect(() => { void reload(); }, []);

  const gruposExistentes = useMemo(
    () => [...new Set(categories.map((c) => topLevel(c.name)))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [categories],
  );

  const porGrupo = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of categories) {
      const g = topLevel(c.name);
      const s = subLevel(c.name);
      const arr = map.get(g) ?? [];
      if (s) arr.push(s);
      map.set(g, arr);
    }
    return [...map.entries()]
      .map(([g, subs]) => [g, subs.sort((a, b) => a.localeCompare(b, 'pt-BR'))] as const)
      .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  }, [categories]);

  async function criar() {
    if (!grupo.trim()) return;
    const nome = sub.trim() ? `${grupo.trim()} > ${sub.trim()}` : grupo.trim();
    setBusy(true);
    setError(null);
    try {
      await createCategory(nome);
      setGrupo('');
      setSub('');
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
        <h1>Categorias</h1>
      </div>
      <p className="muted review-hint">
        Crie uma categoria nova ou uma subcategoria dentro de uma já existente
        — nesse caso, digite o nome do grupo igual ao que já aparece na lista
        abaixo (tem sugestão automática) e preencha a subcategoria.
      </p>

      <div className="perm-form">
        <input
          list="grupos-existentes"
          placeholder="Categoria (ex.: Brinquedos)"
          value={grupo}
          onChange={(e) => setGrupo(e.target.value)}
        />
        <datalist id="grupos-existentes">
          {gruposExistentes.map((g) => <option key={g} value={g} />)}
        </datalist>
        <input
          placeholder="Subcategoria (opcional)"
          value={sub}
          onChange={(e) => setSub(e.target.value)}
        />
        <button className="primary" onClick={criar} disabled={busy || !grupo.trim()}>
          {busy ? 'Criando…' : 'Criar categoria'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted center-msg">Carregando…</p>}

      {!loading && porGrupo.length === 0 && (
        <p className="muted center-msg">Nenhuma categoria cadastrada ainda.</p>
      )}

      {porGrupo.length > 0 && (
        <ul className="perm-list">
          {porGrupo.map(([g, subs]) => (
            <li key={g} className="perm-row cat-group-row">
              <span className="perm-email">{g}</span>
              {subs.length > 0 && <span className="muted small">{subs.join(' · ')}</span>}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
