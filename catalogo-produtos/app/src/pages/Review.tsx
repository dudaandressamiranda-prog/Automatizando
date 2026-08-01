import { useEffect, useMemo, useState } from 'react';
import { ProductCard } from '../components/ProductCard';
import { criarBusca } from '../lib/busca';
import { photoSrc, useSignedUrls } from '../lib/photos';
import { supabase } from '../lib/supabase';
import { LIST_COLUMNS, type ListProduct } from '../lib/types';

const PAGE = 1000;

/**
 * Produtos desativados por falta de código de barras — a lista de
 * trabalho para ir cadastrando os EANs aos poucos. Fica fora da vitrine
 * principal; só quem abre esta página os vê.
 */
export function Review() {
  const [products, setProducts] = useState<ListProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    async function load() {
      const todos: ListProduct[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error: err } = await supabase
          .from('products')
          .select(LIST_COLUMNS)
          .neq('status', 'ativo')
          .order('name')
          .range(from, from + PAGE - 1);
        if (!alive) return;
        if (err) {
          setError(err.message);
          break;
        }
        todos.push(...((data ?? []) as ListProduct[]));
        setProducts([...todos]);
        if (!data || data.length < PAGE) break;
      }
      setLoading(false);
    }
    void load();
    return () => {
      alive = false;
    };
  }, []);

  const signed = useSignedUrls(products);

  const filtered = useMemo(() => {
    const casa = criarBusca(q);
    if (!casa) return products;
    return products.filter((p) => casa(`${p.name} ${p.brand ?? ''}`));
  }, [q, products]);

  return (
    <main className="content">
      <div className="page-head">
        <h1>Produtos a revisar</h1>
        <span className="muted small">{products.length} sem código de barras</span>
      </div>
      <p className="muted review-hint">
        Estes produtos estão fora do catálogo porque ainda não têm código de barras.
        Abra cada um, informe o código lido na embalagem e salve — ele volta para a vitrine.
      </p>

      <div className="searchbar">
        <input
          type="search"
          placeholder="Filtrar por nome ou marca — use % entre palavras"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {error && <p className="error">Erro ao carregar: {error}</p>}
      {loading && <p className="muted center-msg">Carregando…</p>}
      {!loading && filtered.length === 0 && (
        <p className="muted center-msg">
          {q ? 'Nenhum produto encontrado.' : 'Nenhum produto pendente de código. 🎉'}
        </p>
      )}

      <div className="card-grid">
        {filtered.map((p) => (
          <ProductCard key={p.id} product={p} src={photoSrc(p, signed)} />
        ))}
      </div>
    </main>
  );
}
