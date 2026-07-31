import { useEffect, useMemo, useState } from 'react';
import { subPath, topLevel } from '../lib/catalog';
import { iconFor } from '../lib/categoryIcons';
import { STORES, storeLabel, type StoreId } from '../lib/store';
import { supabase } from '../lib/supabase';
import type { Route } from '../hooks/useHashRoute';

interface Props {
  route: Route;
  onNavigate: () => void; // fecha o drawer no mobile após clicar
  onSignOut: () => void;
  email?: string;
  admin: boolean;
  store: StoreId;
  /** Trocar de loja a qualquer momento — só quem atende as duas (admin). */
  onChooseStore?: (id: StoreId) => void;
}

interface Cat {
  id: string;
  name: string;
}

export function Nav({ route, onNavigate, onSignOut, email, admin, store, onChooseStore }: Props) {
  const [cats, setCats] = useState<Cat[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [cartOpen, setCartOpen] = useState(false);

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
      {onChooseStore ? (
        // atende as duas lojas: as duas ficam sempre a um clique
        <div className="nav-stores">
          {STORES.map((s) => (
            <button
              key={s.id}
              className={`nav-store-btn ${store === s.id ? 'on' : ''}`}
              onClick={() => onChooseStore(s.id)}
              aria-pressed={store === s.id}
            >
              <span aria-hidden>{s.emoji}</span> {s.label.replace('Loja ', '')}
            </button>
          ))}
        </div>
      ) : (
        <div className="nav-store">
          <span className="nav-store-name">{storeLabel(store)}</span>
        </div>
      )}

      <a href="#/" className={`nav-item ${route.page === 'list' ? 'active' : ''}`} onClick={onNavigate}>
        <span className="nav-ico">🏠</span> Início
      </a>

      {onChooseStore ? (
        <div className="nav-cat-group">
          <div className={`nav-item nav-cat-row ${route.page === 'cart' ? 'active' : ''}`}>
            <a
              href="#/carrinho"
              className="nav-cat-link"
              onClick={() => { setCartOpen(true); onNavigate(); }}
            >
              <span className="nav-ico">🛒</span> Carrinhos
            </a>
            <button
              className="nav-expand"
              onClick={(e) => { e.preventDefault(); setCartOpen((v) => !v); }}
              aria-label={cartOpen ? 'Recolher lojas' : 'Ver as duas lojas'}
            >
              {cartOpen ? '▾' : '▸'}
            </button>
          </div>
          {cartOpen && (
            <div className="nav-subs">
              {STORES.map((s) => (
                <a
                  key={s.id}
                  href="#/carrinho"
                  className={`nav-subitem ${route.page === 'cart' && store === s.id ? 'active' : ''}`}
                  onClick={() => { onChooseStore(s.id); onNavigate(); }}
                >
                  {s.emoji} {s.label.replace('Loja ', '')}
                </a>
              ))}
            </div>
          )}
        </div>
      ) : (
        <a href="#/carrinho" className={`nav-item ${route.page === 'cart' ? 'active' : ''}`} onClick={onNavigate}>
          <span className="nav-ico">🛒</span> Carrinhos
        </a>
      )}

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
            href="#/etiquetas"
            className={`nav-item ${route.page === 'labels' ? 'active' : ''}`}
            onClick={onNavigate}
          >
            <span className="nav-ico">🖨️</span> Etiquetas
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
