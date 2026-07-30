import { useEffect, useState } from 'react';
import { handleAuthError } from './authError';
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
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    async function load() {
      const cats = await supabase.from('categories').select('id, name').order('name');
      if (!alive) return;
      if (cats.error) {
        if (handleAuthError(cats.error.message)) return; // sessão inválida → volta ao login
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
          // catálogo mostra só produtos ativos — sem EAN/desativados ficam
          // no banco para edição, mas fora da vitrine
          .eq('status', 'ativo')
          .order('name')
          .range(from, from + PAGE - 1);
        if (!alive) return;
        if (err) {
          if (handleAuthError(err.message)) return;
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
  }, [reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  return { products, categories, loading, error, reload };
}

/** Cria uma categoria nova (uso do admin). Nome duplicado vira erro amigável. */
export async function createCategory(name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) throw new Error('Nome da categoria não pode ser vazio.');
  const { error } = await supabase.from('categories').insert({ name: clean });
  if (error) {
    if (error.code === '23505') throw new Error('Essa categoria já existe.');
    throw new Error(error.message);
  }
}

/**
 * Atribui uma categoria para vários produtos de uma vez (uso do admin, para
 * corrigir categorização em massa). Faz em lotes para não estourar o limite
 * de uma única requisição.
 */
export async function bulkSetCategory(ids: string[], categoryId: string): Promise<void> {
  for (let i = 0; i < ids.length; i += 80) {
    const { error } = await supabase
      .from('products')
      .update({ category_id: categoryId })
      .in('id', ids.slice(i, i + 80));
    if (error) throw error;
  }
}
