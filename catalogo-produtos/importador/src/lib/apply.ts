import type { SupabaseClient } from '@supabase/supabase-js';
import { norm } from './normalize.js';
import type { ExistingCategory, ExistingProduct, Plan } from './plan.js';

const BATCH = 200;

export async function fetchExisting(db: SupabaseClient): Promise<{
  products: ExistingProduct[];
  categories: ExistingCategory[];
}> {
  const categories: ExistingCategory[] = [];
  const products: ExistingProduct[] = [];

  {
    const { data, error } = await db.from('categories').select('id, name');
    if (error) throw new Error(`Erro lendo categorias: ${error.message}`);
    categories.push(...(data ?? []));
  }

  // paginação — a base pode passar de 1000 produtos (limite padrão do PostgREST)
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('products')
      .select('id, name, barcode, brand, supplier, category_id, source, external_id, dedupe_key')
      .order('created_at', { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`Erro lendo produtos: ${error.message}`);
    products.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  return { products, categories };
}

export async function applyPlan(
  db: SupabaseClient,
  plan: Plan,
  existingCategories: ExistingCategory[],
): Promise<void> {
  const categoryIdByNorm = new Map(existingCategories.map((c) => [norm(c.name), c.id]));

  // 1. categorias novas
  if (plan.newCategories.length > 0) {
    const { data, error } = await db
      .from('categories')
      .insert(plan.newCategories.map((name) => ({ name })))
      .select('id, name');
    if (error) throw new Error(`Erro criando categorias: ${error.message}`);
    for (const c of data ?? []) categoryIdByNorm.set(norm(c.name), c.id);
  }

  const categoryId = (name: string | null | undefined): string | null =>
    name ? (categoryIdByNorm.get(norm(name)) ?? null) : null;

  // 2. inserts em lote
  for (let i = 0; i < plan.inserts.length; i += BATCH) {
    const batch = plan.inserts.slice(i, i + BATCH).map((p) => ({
      name: p.name,
      barcode: p.barcode,
      brand: p.brand,
      supplier: p.supplier,
      category_id: categoryId(p.categoryName),
      source: p.source,
      external_id: p.external_id,
      external_url: p.external_url,
    }));
    const { error } = await db.from('products').insert(batch);
    if (error) throw new Error(`Erro inserindo produtos (lote a partir do item ${i + 1}): ${error.message}`);
  }

  // 3. updates (um a um — cada produto muda campos diferentes)
  for (const u of plan.updates) {
    const { categoryName, ...rest } = u.changes;
    const payload: Record<string, unknown> = { ...rest };
    if (categoryName !== undefined) payload.category_id = categoryId(categoryName);
    const { error } = await db.from('products').update(payload).eq('id', u.id);
    if (error) throw new Error(`Erro atualizando produto ${u.id}: ${error.message}`);
  }
}
