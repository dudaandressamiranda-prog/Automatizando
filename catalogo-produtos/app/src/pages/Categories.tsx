import { useEffect, useMemo, useState } from 'react';
import { countByCategory, createCategory, deleteCategory, renameCategory, subLevel, topLevel } from '../lib/catalog';
import { supabase } from '../lib/supabase';
import type { Category } from '../lib/types';

/**
 * Menu de categorias (admin): cria categoria nova (nível 1) ou subcategoria
 * dentro de uma já existente, renomeia ou exclui — sem precisar mexer no
 * banco na mão. Excluir não apaga produtos: eles só ficam sem categoria.
 */
export function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grupo, setGrupo] = useState('');
  const [sub, setSub] = useState('');
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  async function reload() {
    const { data, error: err } = await supabase.from('categories').select('id, name').order('name');
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setCategories(data ?? []);
    setLoading(false);
    setCounts(await countByCategory());
  }
  useEffect(() => { void reload(); }, []);

  const gruposExistentes = useMemo(
    () => [...new Set(categories.map((c) => topLevel(c.name)))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [categories],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Category[]>();
    for (const c of categories) {
      const g = topLevel(c.name);
      const arr = map.get(g) ?? [];
      arr.push(c);
      map.set(g, arr);
    }
    return [...map.entries()]
      .map(([g, cats]) => [
        g,
        cats.sort((a, b) => (subLevel(a.name) ?? '').localeCompare(subLevel(b.name) ?? '', 'pt-BR')),
      ] as const)
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

  function startEdit(c: Category) {
    setError(null);
    setEditingId(c.id);
    setEditValue(c.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValue('');
  }

  async function salvarEdit(id: string) {
    setRowBusy(id);
    setError(null);
    try {
      await renameCategory(id, editValue);
      cancelEdit();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRowBusy(null);
    }
  }

  async function excluir(c: Category) {
    const n = counts.get(c.id) ?? 0;
    const aviso =
      n > 0
        ? `Excluir "${c.name}"? ${n} produto${n === 1 ? '' : 's'} vão ficar sem categoria (não são apagados).`
        : `Excluir "${c.name}"?`;
    if (!confirm(aviso)) return;
    setRowBusy(c.id);
    setError(null);
    try {
      await deleteCategory(c.id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRowBusy(null);
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
        abaixo (tem sugestão automática) e preencha a subcategoria. Cada
        categoria também pode ser renomeada (✏️) ou excluída (✕) — excluir não
        apaga os produtos, só tira a categoria deles.
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

      {!loading && grouped.length === 0 && (
        <p className="muted center-msg">Nenhuma categoria cadastrada ainda.</p>
      )}

      {grouped.map(([g, cats]) => (
        <div key={g} className="cat-group">
          <h3 className="cat-group-title">{g}</h3>
          <ul className="perm-list">
            {cats.map((c) => {
              const label = subLevel(c.name) ?? '(categoria principal)';
              const n = counts.get(c.id) ?? 0;
              return (
                <li key={c.id} className="perm-row cat-row">
                  {editingId === c.id ? (
                    <>
                      <input
                        className="cat-edit-input"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        autoFocus
                      />
                      <button
                        className="link-muted"
                        onClick={() => salvarEdit(c.id)}
                        disabled={rowBusy === c.id || !editValue.trim()}
                      >
                        {rowBusy === c.id ? 'Salvando…' : 'Salvar'}
                      </button>
                      <button className="link-muted" onClick={cancelEdit} disabled={rowBusy === c.id}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="perm-email">{label}</span>
                      <span className="muted small">{n} produto{n === 1 ? '' : 's'}</span>
                      <button
                        className="cat-icon-btn"
                        onClick={() => startEdit(c)}
                        title="Renomear"
                        aria-label="Renomear"
                        disabled={rowBusy === c.id}
                      >
                        ✏️
                      </button>
                      <button
                        className="cart-del"
                        onClick={() => excluir(c)}
                        title="Excluir"
                        aria-label="Excluir"
                        disabled={rowBusy === c.id}
                      >
                        ✕
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </main>
  );
}
