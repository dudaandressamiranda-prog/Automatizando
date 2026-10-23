/**
 * Sincronização de produtos com o Tiny, um código de barras por vez.
 *
 * A consulta ao Tiny é feita pela função `tiny-produto` do Supabase (o
 * token do Tiny não pode vir para o app). Ela só devolve os dados; a
 * gravação no catálogo acontece aqui, com a sessão de quem está logado —
 * e o banco só deixa admin gravar em `products`.
 *
 * Mesmas regras do importador de planilhas:
 * - produto novo só entra ativo com foto; sem foto entra desativado;
 * - produto existente nunca tem a situação mexida (`status_manual` incluso);
 * - campo vazio no Tiny não apaga nada do catálogo;
 * - categoria do Tiny só preenche produto sem categoria;
 * - foto enviada para o catálogo (bucket) vence a do Tiny;
 * - código de barras já cadastrado nunca é trocado por outro.
 */
import { FunctionsHttpError } from '@supabase/supabase-js';
import { norm } from './normalize';
import { supabase } from './supabase';

export interface ProdutoTiny {
  tiny_id: string;
  nome: string;
  marca: string | null;
  fornecedor: string | null;
  categoria: string | null;
  fotos: string[];
  /** A = ativo, I = inativo (no Tiny, inativo = não vende online). */
  situacao: string;
}

export type ConsultaTiny =
  | { ean: string; status: 'ok'; produto: ProdutoTiny }
  | { ean: string; status: 'nao_encontrado' }
  | { ean: string; status: 'kit'; nome: string }
  | { ean: string; status: 'erro'; erro: string };

/** Limite da função por chamada. */
export const LOTE_TINY = 10;

export async function consultarTiny(eans: string[]): Promise<ConsultaTiny[]> {
  const { data, error } = await supabase.functions.invoke('tiny-produto', { body: { eans } });
  if (error) {
    let msg = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const corpo = await error.context.json();
        if (corpo?.erro) msg = corpo.erro;
      } catch {
        /* resposta sem JSON: fica a mensagem genérica */
      }
    }
    throw new Error(msg);
  }
  return (data as { resultados: ConsultaTiny[] }).resultados;
}

export interface Categoria {
  id: string;
  name: string;
}

/** "Cães >> Brinquedos" do Tiny casa com "Cães > Brinquedos" do catálogo. */
function acharCategoria(nomeTiny: string | null, categorias: Categoria[]): string | null {
  if (!nomeTiny) return null;
  const alvo = norm(nomeTiny.replace(/\s*>>\s*/g, ' > '));
  return categorias.find((c) => norm(c.name) === alvo)?.id ?? null;
}

export type Sincronizado =
  | { acao: 'criado'; id: string; ativo: boolean }
  | { acao: 'atualizado'; id: string; mudancas: string[] }
  | { acao: 'igual'; id: string }
  | { acao: 'conflito'; id: string; barcode: string };

const COLUNAS = 'id, name, barcode, brand, supplier, category_id, external_id, photo_path, photo_source_url';

export async function aplicarNoCatalogo(ean: string, p: ProdutoTiny, categorias: Categoria[]): Promise<Sincronizado> {
  const { data: porCodigo, error: e1 } = await supabase.from('products').select(COLUNAS).eq('barcode', ean).limit(1);
  if (e1) throw e1;
  let atual = porCodigo?.[0];

  // mesmo produto do Tiny já no catálogo sem código de barras (ou com outro)
  if (!atual) {
    const { data: porId, error: e2 } = await supabase.from('products').select(COLUNAS).eq('external_id', p.tiny_id).limit(1);
    if (e2) throw e2;
    atual = porId?.[0];
    if (atual?.barcode && atual.barcode !== ean) return { acao: 'conflito', id: atual.id, barcode: atual.barcode };
  }

  const categoriaId = acharCategoria(p.categoria, categorias);
  const foto = p.fotos[0] ?? null;

  if (!atual) {
    const { data, error } = await supabase
      .from('products')
      .insert({
        name: p.nome,
        barcode: ean,
        brand: p.marca,
        supplier: p.fornecedor,
        category_id: categoriaId,
        source: 'erp',
        external_id: p.tiny_id,
        photo_source_url: foto,
        photo_updated_at: foto ? new Date().toISOString() : null,
        // produto ativo só com foto
        status: foto ? 'ativo' : 'desativado',
      })
      .select('id')
      .single();
    if (error) throw error;
    return { acao: 'criado', id: data.id as string, ativo: Boolean(foto) };
  }

  const mudar: Record<string, unknown> = {};
  const mudancas: string[] = [];
  if (!atual.barcode) {
    mudar.barcode = ean;
    mudancas.push('código de barras');
  }
  if (p.nome && p.nome !== atual.name) {
    mudar.name = p.nome;
    mudancas.push('nome');
  }
  if (p.marca && p.marca !== atual.brand) {
    mudar.brand = p.marca;
    mudancas.push('marca');
  }
  if (p.fornecedor && p.fornecedor !== atual.supplier) {
    mudar.supplier = p.fornecedor;
    mudancas.push('fornecedor');
  }
  if (foto && !atual.photo_path && foto !== atual.photo_source_url) {
    mudar.photo_source_url = foto;
    mudar.photo_updated_at = new Date().toISOString();
    mudancas.push('foto');
  }
  if (categoriaId && !atual.category_id) {
    mudar.category_id = categoriaId;
    mudancas.push('categoria');
  }
  if (!atual.external_id) mudar.external_id = p.tiny_id;

  if (!Object.keys(mudar).length) return { acao: 'igual', id: atual.id };
  const { error } = await supabase.from('products').update(mudar).eq('id', atual.id);
  if (error) throw error;
  return mudancas.length ? { acao: 'atualizado', id: atual.id, mudancas } : { acao: 'igual', id: atual.id };
}
