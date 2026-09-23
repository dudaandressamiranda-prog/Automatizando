/**
 * Lotes e validades da prateleira.
 *
 * Conferência, não estoque: grava o lote e a validade que a câmera leu na
 * embalagem (como texto), sem quantidade e sem descontar nada.
 */
import { supabase } from './supabase';
import type { StoreId } from './store';

/** A partir de quantos dias para vencer o item entra em alerta. */
export const DIAS_ALERTA = 30;

export interface Validade {
  id: string;
  store: StoreId;
  product_id: string | null;
  product_name: string;
  barcode: string | null;
  lote: string | null;
  /** aaaa-mm-dd; só mês/ano vira o último dia do mês. */
  validade: string | null;
  validade_so_mes: boolean;
  created_by: string | null;
  created_at: string;
}

export interface NovaValidade {
  product_id: string | null;
  product_name: string;
  barcode: string | null;
  lote: string | null;
  validade: string | null;
  validade_so_mes: boolean;
}

/** Produto achado pelo código — inclusive desativado, que continua na prateleira. */
export interface ProdutoDoCodigo {
  id: string;
  name: string;
  barcode: string | null;
  photo_path: string | null;
  photo_source_url: string | null;
}

export async function buscarPorCodigo(codigo: string): Promise<ProdutoDoCodigo | null> {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, barcode, photo_path, photo_source_url')
    .eq('barcode', codigo)
    .limit(1);
  if (error) throw error;
  return (data?.[0] as ProdutoDoCodigo | undefined) ?? null;
}

export async function listarValidades(store: StoreId): Promise<Validade[]> {
  const { data, error } = await supabase
    .from('validades')
    .select('*')
    .eq('store', store)
    .order('validade', { ascending: true, nullsFirst: false })
    .limit(2000);
  if (error) throw error;
  return (data ?? []) as Validade[];
}

export async function registrarValidade(store: StoreId, v: NovaValidade, email: string | null): Promise<Validade> {
  const { data, error } = await supabase
    .from('validades')
    .insert({
      store,
      product_id: v.product_id,
      // cópia do nome: o registro precisa sobreviver ao produto sair do catálogo
      product_name: v.product_name.trim(),
      barcode: v.barcode,
      lote: v.lote?.trim() || null,
      validade: v.validade,
      validade_so_mes: v.validade_so_mes,
      created_by: email,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Validade;
}

export async function apagarValidade(id: string): Promise<void> {
  const { error } = await supabase.from('validades').delete().eq('id', id);
  if (error) throw error;
}

/** "15/08/2026", ou "08/2026" quando a embalagem só traz mês e ano. */
export function formataValidade(v: Pick<Validade, 'validade' | 'validade_so_mes'>): string {
  if (!v.validade) return '—';
  const [a, m, d] = v.validade.split('-');
  return v.validade_so_mes ? `${m}/${a}` : `${d}/${m}/${a}`;
}

export type Situacao = 'vencido' | 'alerta' | 'ok' | 'sem';

/** Dias até vencer, contados no calendário de quem está olhando. */
export function diasParaVencer(iso: string): number {
  const [a, m, d] = iso.split('-').map(Number);
  const hoje = new Date();
  return Math.round(
    (Date.UTC(a!, m! - 1, d!) - Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())) / 86_400_000,
  );
}

export function situacao(v: Pick<Validade, 'validade'>): { tipo: Situacao; rotulo: string } {
  if (!v.validade) return { tipo: 'sem', rotulo: 'sem validade' };
  const dias = diasParaVencer(v.validade);
  if (dias < 0) return { tipo: 'vencido', rotulo: dias === -1 ? 'venceu ontem' : `vencido há ${-dias} dias` };
  if (dias === 0) return { tipo: 'alerta', rotulo: 'vence hoje' };
  if (dias <= DIAS_ALERTA) return { tipo: 'alerta', rotulo: dias === 1 ? 'vence amanhã' : `vence em ${dias} dias` };
  return { tipo: 'ok', rotulo: `vence em ${dias} dias` };
}

/** Planilha (CSV com ; e BOM, que o Excel em português abre certo). */
export function validadesCsv(itens: Validade[]): string {
  const cel = (v: string | null | undefined) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const linhas = [['Código de barras', 'Produto', 'Lote', 'Validade', 'Situação', 'Registrado por', 'Registrado em']];
  for (const v of itens) {
    linhas.push([
      // o ="..." impede o Excel de transformar o código em 7,89E+12
      v.barcode ? `="${v.barcode}"` : '',
      v.product_name,
      v.lote ?? '',
      formataValidade(v),
      situacao(v).rotulo,
      v.created_by ?? '',
      new Date(v.created_at).toLocaleString('pt-BR'),
    ]);
  }
  return '﻿' + linhas.map((l) => l.map(cel).join(';')).join('\r\n');
}
