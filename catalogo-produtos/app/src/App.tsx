import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { Nav } from './components/Nav';
import { SaveGuard } from './components/SaveGuard';
import { useHashRoute } from './hooks/useHashRoute';
import { isAdmin } from './lib/admin';
import { useActiveStore } from './lib/store';
import { supabase } from './lib/supabase';
import { Cart } from './pages/Cart';
import { CategoryPage } from './pages/CategoryPage';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Logs } from './pages/Logs';
import { ProductForm } from './pages/ProductForm';
import { Review } from './pages/Review';
import { StorePicker } from './pages/StorePicker';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { route, navigate } = useHashRoute();
  const { active, choose, clear, canSwitch } = useActiveStore(session);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => setMenuOpen(false), [route]);

  if (!ready) return <div className="center-msg">Carregando…</div>;
  if (!session) return <Login />;

  // sem loja definida (ex.: admin) → escolhe em qual loja vai atuar
  if (!active) {
    return (
      <StorePicker
        onChoose={choose}
        email={session.user.email ?? undefined}
        onSignOut={() => supabase.auth.signOut()}
      />
    );
  }

  const admin = isAdmin(session.user.email);
  const adminOnly = route.page === 'new' || route.page === 'review' || route.page === 'logs';
  const blocked = adminOnly && !admin;

  return (
    <div className="shell">
      <header className="topbar">
        <button className="menu-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu">☰</button>
        <a href="#/" className="brand"><span className="brand-mark">🐾</span> Catálogo</a>
      </header>

      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <Nav
          route={route}
          onNavigate={() => setMenuOpen(false)}
          onSignOut={() => supabase.auth.signOut()}
          email={session.user.email ?? undefined}
          admin={admin}
          store={active}
          onSwitchStore={canSwitch ? clear : undefined}
        />
      </aside>

      <div className="main">
        {(blocked || route.page === 'list') && <Home navigate={navigate} />}
        {!blocked && route.page === 'category' && <CategoryPage group={route.group} store={active} />}
        {!blocked && route.page === 'cart' && <Cart store={active} />}
        {!blocked && route.page === 'review' && <Review />}
        {!blocked && route.page === 'logs' && <Logs />}
        {!blocked && route.page === 'new' && <ProductForm navigate={navigate} initialBarcode={route.barcode} />}
        {route.page === 'product' && <ProductForm navigate={navigate} productId={route.id} />}
      </div>

      <SaveGuard store={active} />
    </div>
  );
}
