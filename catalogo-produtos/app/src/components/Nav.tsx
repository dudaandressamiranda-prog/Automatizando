import { useEffect, useState } from 'react';
import { topLevel } from '../lib/catalog';
import { useCart } from '../lib/cart';
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

/** Emoji por categoria de topo — dá um respiro visual à navegação. */
const ICONE: Record<string, string> = {
  'Ração para Cães': '🦴',
  'Ração para Gatos': '🐱',
  'Ração para Peixes': '🐠',
  'Ração para Roedores': '🐹',
  'Ração para Répteis': '🦎',
  Medicamentos: '💊',
  'Higiene e Limpeza': '🧴',
  Brinquedos: '🧸',
  Acessórios: '🎽',
  Armarinho: '🎀',
  Sementes: '🌱',
};

export function Nav({ route, onNavigate, onSignOut, email, admin, store, onSwitchStore }: Props) {
  const [groups, setGroups] = useState<string[]>([]);
  const { items } = useCart(store);

  useEffect(() => {
    supabase
      .from('categories')
      .select('name')
      .then(({ data }) => {
        const tops = [...new Set((data ?? []).map((c) => topLevel(c.name)))].sort((a, b) =>
          a.localeCompare(b, 'pt-BR'),
        );
        setGroups(tops);
      });
  }, []);

  const activeGroup = route.page === 'category' ? route.group : null;

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
        <span className="nav-ico">🛒</span> Carrinho
        {items.length > 0 && <span className="nav-badge">{items.length}</span>}
      </a>

      {admin && (
        <>
          <div className="nav-section">Administração</div>
          <a
            href="#/novo"
            className={`nav-item ${route.page === 'new' ? 'active' : ''}`}
            onClick={onNavigate}
          >
            <span className="nav-ico">➕</span> Cadastrar produto
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
      {groups.map((g) => (
        <a
          key={g}
          href={`#/c/${encodeURIComponent(g)}`}
          className={`nav-item ${activeGroup === g ? 'active' : ''}`}
          onClick={onNavigate}
        >
          <span className="nav-ico">{ICONE[g] ?? '📦'}</span> {g}
        </a>
      ))}

      <div className="nav-foot">
        {email && <div className="nav-email">{email}</div>}
        <button className="nav-item nav-signout" onClick={onSignOut}>
          <span className="nav-ico">🚪</span> Sair
        </button>
      </div>
    </nav>
  );
}
