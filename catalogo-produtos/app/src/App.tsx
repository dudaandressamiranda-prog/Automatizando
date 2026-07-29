import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { Nav } from './components/Nav';
import { useHashRoute } from './hooks/useHashRoute';
import { isAdmin } from './lib/admin';
import { supabase } from './lib/supabase';
import { CategoryPage } from './pages/CategoryPage';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Logs } from './pages/Logs';
import { ProductForm } from './pages/ProductForm';
import { Review } from './pages/Review';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { route, navigate } = useHashRoute();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // fecha o menu (mobile) sempre que a rota muda
  useEffect(() => setMenuOpen(false), [route]);

  if (!ready) return <div className="center-msg">Carregando…</div>;
  if (!session) return <Login />;

  const admin = isAdmin(session.user.email);
  // rotas administrativas: se não for admin, cai para o início
  const adminOnly = route.page === 'new' || route.page === 'review' || route.page === 'logs';
  const blocked = adminOnly && !admin;

  return (
    <div className="shell">
      <header className="topbar">
        <button className="menu-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu">
          ☰
        </button>
        <a href="#/" className="brand">
          <span className="brand-mark">🐾</span> Catálogo
        </a>
      </header>

      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <Nav
          route={route}
          onNavigate={() => setMenuOpen(false)}
          onSignOut={() => supabase.auth.signOut()}
          email={session.user.email ?? undefined}
          admin={admin}
        />
      </aside>

      <div className="main">
        {blocked && <Home navigate={navigate} />}
        {!blocked && route.page === 'list' && <Home navigate={navigate} />}
        {!blocked && route.page === 'category' && <CategoryPage group={route.group} />}
        {!blocked && route.page === 'review' && <Review />}
        {!blocked && route.page === 'logs' && <Logs />}
        {!blocked && route.page === 'new' && <ProductForm navigate={navigate} initialBarcode={route.barcode} />}
        {/* edição de produto: aberta a qualquer usuário logado (a vitrine linka para cá) */}
        {route.page === 'product' && <ProductForm navigate={navigate} productId={route.id} />}
      </div>
    </div>
  );
}
