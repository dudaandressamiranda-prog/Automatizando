import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { useHashRoute } from './hooks/useHashRoute';
import { supabase } from './lib/supabase';
import { Login } from './pages/Login';
import { ProductForm } from './pages/ProductForm';
import { ProductList } from './pages/ProductList';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const { route, navigate } = useHashRoute();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return <div className="center-msg">Carregando…</div>;
  if (!session) return <Login />;

  return (
    <div className="app">
      <header className="topbar">
        <a href="#/" className="brand">Catálogo</a>
        <button
          className="link"
          onClick={() => supabase.auth.signOut()}
          title={session.user.email ?? undefined}
        >
          Sair
        </button>
      </header>

      {route.page === 'list' && <ProductList navigate={navigate} />}
      {route.page === 'new' && <ProductForm navigate={navigate} initialBarcode={route.barcode} />}
      {route.page === 'product' && <ProductForm navigate={navigate} productId={route.id} />}
    </div>
  );
}
