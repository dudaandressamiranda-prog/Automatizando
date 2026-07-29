import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Category, Product } from './types';

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
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      supabase.from('categories').select('id, name').order('name'),
      supabase.from('products').select('*').order('name').limit(2000),
    ]).then(([cats, prods]) => {
      if (!alive) return;
      if (cats.error || prods.error) {
        setError(`Erro carregando o catálogo: ${(cats.error ?? prods.error)!.message}`);
      } else {
        setCategories(cats.data ?? []);
        setProducts(prods.data ?? []);
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  return { products, categories, loading, error };
}
