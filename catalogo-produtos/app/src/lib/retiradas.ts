/**
 * Retiradas para uso interno.
 *
 * O que sai da prateleira sem passar pelo caixa: o shampoo que o banho e
 * tosa usou, o saco de ração aberto para vender a granel. É registro, não
 * contabilidade — nada aqui desconta de estoque nenhum, porque o catálogo
 * não controla estoque.
 */
import { supabase } from './supabase';
import type { StoreId } from './store';

export type TipoRetirada = 'banho_tosa' | 'granel' | 'outro';
export type Unidade = 'un' | 'kg' | 'g' | 'ml' | 'l';

export const TIPO_LABEL: Record<TipoRetirada, string> = {
  banho_tosa: 'Banho e tosa',
  granel: 'Aberto para granel',
  outro: 'Outro uso interno',
};

export const TIPO_ICONE: Record<TipoRetirada, string> = {
  banho_tosa: '🛁',
  granel: '⚖️',
  outro: '📦',
};

export const UNIDADES: Unidade[] = ['un', 'kg', 'g', 'ml', 'l'];

export interface Retirada {
  id: string;
  store: StoreId;
  product_id: string | null;
  product_name: string;
  barcode: string | null;
  tipo: TipoRetirada;
  qty: number;
  unidade: Unidade;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  /** Já foi usado para dar baixa no outro sistema — conferência de trabalho. */
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
}

export interface NovaRetirada {
  product_id: string | null;
  product_name: string;
  barcode: string | null;
  tipo: TipoRetirada;
  qty: number;
  unidade: Unidade;
  notes?: string | null;
}

/** Últimas retiradas da loja. O limite existe para a tela não crescer sem fim. */
export async function listarRetiradas(store: StoreId, limite = 300): Promise<Retirada[]> {
  const { data, error } = await supabase
    .from('retiradas')
    .select('*')
    .eq('store', store)
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []) as Retirada[];
}

export async function registrarRetirada(
  store: StoreId,
  r: NovaRetirada,
  email: string | null,
): Promise<Retirada> {
  const { data, error } = await supabase
    .from('retiradas')
    .insert({
      store,
      product_id: r.product_id,
      // cópia do nome: o registro precisa sobreviver ao produto sair do catálogo
      product_name: r.product_name.trim(),
      barcode: r.barcode,
      tipo: r.tipo,
      qty: r.qty,
      unidade: r.unidade,
      notes: r.notes?.trim() || null,
      created_by: email,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Retirada;
}

/** Marca (ou desmarca) que este registro já foi usado para atualizar o outro sistema. */
export async function marcarResolvida(id: string, resolved: boolean, email: string | null): Promise<void> {
  const { error } = await supabase
    .from('retiradas')
    .update({ resolved, resolved_by: resolved ? email : null, resolved_at: resolved ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw error;
}

export async function apagarRetirada(id: string): Promise<void> {
  const { error } = await supabase.from('retiradas').delete().eq('id', id);
  if (error) throw error;
}

/** "2,5 kg" — vírgula decimal, e sem casas quando o número é redondo. */
export function formataQtd(qty: number, unidade: Unidade): string {
  const n = Number(qty);
  const texto = Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return `${texto.replace('.', ',')} ${unidade}`;
}
