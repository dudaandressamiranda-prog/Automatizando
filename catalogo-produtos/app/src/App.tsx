import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { Nav } from './components/Nav';
import { SaveGuard } from './components/SaveGuard';
import { useHashRoute } from './hooks/useHashRoute';
import { isAdmin } from './lib/admin';
import { APP_NAME } from './lib/config';
import { useActiveStore } from './lib/store';
import { supabase } from './lib/supabase';
import { Cart } from './pages/Cart';
import { CartsAdmin } from './pages/CartsAdmin';
import { Categories } from './pages/Categories';
import { CategoryPage } from './pages/CategoryPage';
import { Home } from './pages/Home';
import { Labels } from './pages/Labels';
import { Login } from './pages/Login';
import { Logs } from './pages/Logs';
import { NotaFiscal } from './pages/NotaFiscal';
import { Pendencias } from './pages/Pendencias';
import { Permissions } from './pages/Permissions';
import { ProductForm } from './pages/ProductForm';
import { ProductView } from './pages/ProductView';
import { Retiradas } from './pages/Retiradas';
import { Review } from './pages/Review';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { route, navigate, voltar } = useHashRoute();
  const admin = isAdmin(session?.user.email);
  const { active, loading: storeLoading, choose, canSwitch } = useActiveStore(session, admin);

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

  const email = session.user.email ?? null;

  // descobrindo a loja do funcionário na tabela de permissões
  if (storeLoading) return <div className="center-msg">Carregando…</div>;

  // funcionário sem loja atribuída → não opera até o admin liberar
  // (o admin nunca cai aqui: atende as duas lojas e já entra numa delas)
  if (!active) {
    return (
      <div className="store-pick">
        <div className="store-pick-inner">
          <img src="/logo.png" alt={APP_NAME} className="store-logo" />
          <p className="muted">
            Seu acesso ainda não está vinculado a uma loja. Peça ao responsável
            para liberar em <strong>Funcionários e lojas</strong>.
          </p>
          <button className="link-muted" onClick={() => supabase.auth.signOut()}>
            Sair {email ? `(${email})` : ''}
          </button>
        </div>
      </div>
    );
  }

  const adminOnly =
    route.page === 'new' || route.page === 'review' || route.page === 'logs' ||
    route.page === 'cartsAdmin' || route.page === 'pendencias' || route.page === 'permissions' || route.page === 'categories' || route.page === 'labels' || route.page === 'nota';
  const blocked = adminOnly && !admin;

  return (
    <div className="shell">
      <header className="topbar">
        <button className="menu-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu">☰</button>
        <a href="#/" className="brand"><img src="/icon.png" alt="" className="brand-logo" /> {APP_NAME}</a>
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
          onChooseStore={canSwitch ? choose : undefined}
        />
      </aside>

      <div className="main">
        {(blocked || route.page === 'list') && (
          <Home navigate={navigate} buscaInicial={route.page === 'list' ? route.q : undefined} />
        )}
        {!blocked && route.page === 'category' && (
          <CategoryPage group={route.group} initialSub={route.sub ?? null} store={active} email={email} admin={admin} />
        )}
        {!blocked && route.page === 'cart' && <Cart store={active} email={email} />}
        {route.page === 'retiradas' && <Retiradas store={active} email={email} />}
        {!blocked && route.page === 'cartsAdmin' && (
          <CartsAdmin email={email} loja={route.loja} carrinho={route.carrinho} />
        )}
        {!blocked && route.page === 'permissions' && <Permissions />}
        {!blocked && route.page === 'categories' && <Categories />}
        {!blocked && route.page === 'labels' && <Labels />}
        {!blocked && route.page === 'nota' && <NotaFiscal />}
        {!blocked && route.page === 'review' && <Review />}
        {!blocked && route.page === 'pendencias' && <Pendencias />}
        {!blocked && route.page === 'logs' && <Logs />}
        {!blocked && route.page === 'new' && (
          <ProductForm voltar={voltar} initialBarcode={route.barcode} />
        )}
        {/* funcionário vê a ficha; só admin abre o formulário de edição.
            key=id força remontar ao pular de um produto para o outro sem
            passar pela lista — como faz "Duplicar", que já abre a cópia —
            senão o formulário ficaria um instante com dado do produto antigo. */}
        {route.page === 'product' && (
          admin
            ? <ProductForm key={route.id} voltar={voltar} productId={route.id} />
            : <ProductView key={route.id} voltar={voltar} productId={route.id} />
        )}
      </div>

      <SaveGuard store={active} email={email} />
    </div>
  );
}
