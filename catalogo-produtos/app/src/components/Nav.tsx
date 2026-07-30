import { useEffect, useMemo, useState } from 'react';
import { subPath, topLevel } from '../lib/catalog';
import { iconFor } from '../lib/categoryIcons';
import { storeLabel, type StoreId } from '../lib/store';
import { supabase } from '../lib/supabase';
import type { Route } from '../hooks/useHashRoute';

interface Props {
  route: Route;
  onNavigate: () => void; // fecha o drawer no mobile após clicar
  onSignOut: () => void;
  email?: string;
  admin: boolean;
  store: StoreId;
  onSwitchStore?: () => void; // trocar de loja (só quem não tem loja fixa)
}

interface Cat {
  id: string;
  name: string;
}

export function Nav({ route, onNavigate, onSignOut, email, admin, store, onSwitchStore }: Props) {
  const [cats, setCats] = useState<Cat[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase
      .from('categories')
      .select('id, name')
      .then(({ data }) => setCats(data ?? []));
  }, []);

  const groups = useMemo(
    () => [...new Set(cats.map((c) => topLevel(c.name)))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [cats],
  );

  const subsByGroup = useMemo(() => {
    const map = new Map<string, { id: string; label: string }[]>();
    for (const c of cats) {
      const label = subPath(c.name);
      if (!label) continue; // registro "principal" do grupo, sem sub
      const g = topLevel(c.name);
      const arr = map.get(g) ?? [];
      arr.push({ id: c.id, label });
      map.set(g, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
    return map;
  }, [cats]);

  const activeGroup = route.page === 'category' ? route.group : null;
  const activeSub = route.page === 'category' ? route.sub : undefined;

  // mostra sempre expandido o grupo da categoria aberta no momento
  useEffect(() => {
    if (activeGroup) setExpanded((s) => (s.has(activeGroup) ? s : new Set(s).add(activeGroup)));
  }, [activeGroup]);

  function toggleExpand(g: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }

  return (
    <nav className="nav">
      <div className="nav-store">
        <span className="nav-store-name">{storeLabel(store)}</span>
        {onSwitchStore && (
          <button className="nav-store-switch" onClick={onSwitchStore}>trocar</button>
        )}
      </div>

      <a href="#/" className={`nav-item ${route.page === 'list' ? 'active' : ''}`} onClick={onNavigate}>
        <span className="nav-ico">🏠</span> Início
      </a>
      <a href="#/carrinho" className={`nav-item ${route.page === 'cart' ? 'active' : ''}`} onClick={onNavigate}>
        <span className="nav-ico">🛒</span> Carrinhos ({storeLabel(store).replace('Loja ', '')})
      </a>

      {admin && (
        <>
          <div className="nav-section">Administração</div>
          <a
            href="#/carrinhos-lojas"
            className={`nav-item ${route.page === 'cartsAdmin' ? 'active' : ''}`}
            onClick={onNavigate}
          >
            <span className="nav-ico">🛍️</span> Carrinhos (todas as lojas)
          </a>
          <a
            href="#/funcionarios"
            className={`nav-item ${route.page === 'permissions' ? 'active' : ''}`}
            onClick={onNavigate}
          >
            <span className="nav-ico">👥</span> Funcionários e lojas
          </a>
          <a
            href="#/novo"
            className={`nav-item ${route.page === 'new' ? 'active' : ''}`}
            onClick={onNavigate}
          >
            <span className="nav-ico">➕</span> Cadastrar produto
          </a>
          <a
            href="#/categorias"
            className={`nav-item ${route.page === 'categories' ? 'active' : ''}`}
            onClick={onNavigate}
          >
            <span className="nav-ico">🗂️</span> Criar categoria
          </a>
          <a
            href="#/revisao"
            className={`nav-item ${route.page === 'review' ? 'active' : ''}`}
            onClick={onNavigate}
          >
            <span className="nav-ico">🏷️</span> A revisar (sem código)
          </a>
          <a
            href="#/logs"
            className={`nav-item ${route.page === 'logs' ? 'active' : ''}`}
            onClick={onNavigate}
          >
            <span className="nav-ico">📋</span> Logs de atividade
          </a>
        </>
      )}

      <div className="nav-section">Categorias</div>
      {groups.map((g) => {
        const subs = subsByGroup.get(g) ?? [];
        const isExpanded = expanded.has(g);
        return (
          <div key={g} className="nav-cat-group">
            <div className={`nav-item nav-cat-row ${activeGroup === g && !activeSub ? 'active' : ''}`}>
              <a
                href={`#/c/${encodeURIComponent(g)}`}
                className="nav-cat-link"
                onClick={onNavigate}
              >
                <span className="nav-ico">{iconFor(g)}</span> {g}
              </a>
              {subs.length > 0 && (
                <button
                  className="nav-expand"
                  onClick={(e) => toggleExpand(g, e)}
                  aria-label={isExpanded ? 'Recolher subcategorias' : 'Ver subcategorias'}
                >
                  {isExpanded ? '▾' : '▸'}
                </button>
              )}
            </div>
            {isExpanded && subs.length > 0 && (
              <div className="nav-subs">
                {subs.map((s) => (
                  <a
                    key={s.id}
                    href={`#/c/${encodeURIComponent(g)}?sub=${s.id}`}
                    className={`nav-subitem ${activeSub === s.id ? 'active' : ''}`}
                    onClick={onNavigate}
                  >
                    {s.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div className="nav-foot">
        {email && <div className="nav-email">{email}</div>}
        <button className="nav-item nav-signout" onClick={onSignOut}>
          <span className="nav-ico">🚪</span> Sair
        </button>
      </div>
    </nav>
  );
}
