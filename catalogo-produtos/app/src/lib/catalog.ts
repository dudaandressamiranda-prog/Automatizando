import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { LIST_COLUMNS, type Category, type ListProduct } from './types';

/** O Supabase devolve no máximo 1000 linhas por requisição. */
const PAGE = 1000;

/** Grupo de categorias de primeiro nível ("Acessórios > Laços" → "Acessórios"). */
export const SEM_CATEGORIA = '__outros__';

export function topLevel(name: string): string {
  return name.split('>')[0]!.trim();
}

export function subLevel(name: string): string | null {
  const i = name.indexOf('>');
  return i === -1 ? null : name.slice(i + 1).trim();
}

/**
 * Carrega o catálogo inteiro (uma vez) — a base é pequena (centenas de
 * produtos), então buscar tudo e filtrar no aparelho é mais rápido do
 * que uma consulta por tecla digitada.
 */
export function useCatalog() {
  const [products, setProducts] = useState<ListProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      const cats = await supabase.from('categories').select('id, name').order('name');
      if (!alive) return;
      if (cats.error) {
        setError(`Erro carregando categorias: ${cats.error.message}`);
        setLoading(false);
        return;
      }
      setCategories(cats.data ?? []);

      // páginas de 1000 até acabar — o catálogo já passa de 3 mil produtos
      const todos: ListProduct[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error: err } = await supabase
          .from('products')
          .select(LIST_COLUMNS)
          .order('name')
          .range(from, from + PAGE - 1);
        if (!alive) return;
        if (err) {
          setError(`Erro carregando o catálogo: ${err.message}`);
          break;
        }
        todos.push(...((data ?? []) as ListProduct[]));
        setProducts([...todos]); // mostra o que já chegou enquanto o resto carrega
        if (!data || data.length < PAGE) break;
      }
      setLoading(false);
    }

    void load();
    return () => {
      alive = false;
    };
  }, []);

  return { products, categories, loading, error };
}
