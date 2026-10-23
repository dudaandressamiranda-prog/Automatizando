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
import { nextInternalEan } from './ean';
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
  if (error) throw new Error(await erroDaFuncao(error));
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

// ---------------------------------------------------------------------------
// Varredura (todos os cadastros do Tiny) — roda em segundo plano na função
// `tiny-varredura`; aqui só acompanha, mostra a prévia e grava o escolhido.
// ---------------------------------------------------------------------------

export interface EstadoVarredura {
  estado: 'parada' | 'listando' | 'detalhando' | 'pronta' | 'erro';
  pagina: number;
  paginas: number | null;
  detalhados: number;
  a_detalhar: number | null;
  mensagem: string | null;
  iniciada_em: string | null;
  concluida_em: string | null;
  atualizada_em: string | null;
  iniciada_por: string | null;
}

export interface ResumoVarredura {
  total: number;
  no_catalogo: number;
  sem_codigo: number;
  kits: number;
  pais: number;
  consultados: number;
  sem_foto: number;
  completos: number;
}

/** Cadastro do Tiny completo (foto + código) que ainda não está no catálogo. */
export interface CandidatoTiny {
  tiny_id: string;
  nome: string;
  gtin: string | null;
  codigo: string | null;
  situacao: string | null;
  tipo_variacao: string | null;
  marca: string | null;
  fornecedor: string | null;
  categoria: string | null;
  fotos: string[];
  /** Já existe no catálogo um produto com o mesmo nome (talvez sem código). */
  nome_parecido: boolean;
}

async function erroDaFuncao(error: Error): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const corpo = await error.context.json();
      if (corpo?.erro) return corpo.erro;
    } catch {
      /* sem JSON */
    }
  }
  return error.message;
}

export async function comandarVarredura(acao: 'iniciar' | 'parar' | 'retomar'): Promise<void> {
  const { error } = await supabase.functions.invoke('tiny-varredura', { body: { acao } });
  if (error) throw new Error(await erroDaFuncao(error));
}

export async function lerVarredura(): Promise<{ estado: EstadoVarredura; resumo: ResumoVarredura }> {
  const [e, r] = await Promise.all([
    supabase.from('tiny_varredura').select('*').eq('id', 1).single(),
    supabase.rpc('tiny_resumo'),
  ]);
  if (e.error) throw e.error;
  if (r.error) throw r.error;
  return { estado: e.data as EstadoVarredura, resumo: r.data as ResumoVarredura };
}

export async function listarCandidatos(): Promise<CandidatoTiny[]> {
  const todos: CandidatoTiny[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from('tiny_candidatos')
      .select('*')
      .order('nome')
      .range(de, de + 999);
    if (error) throw error;
    todos.push(...((data ?? []) as CandidatoTiny[]));
    if (!data || data.length < 1000) break;
  }
  return todos;
}

const soDigitos = (s: string | null) => (s && /^\d{6,14}$/.test(s) ? s : null);

/**
 * Código de barras que o produto vai ter no catálogo: o GTIN; sem ele, o SKU
 * quando o SKU é só números (no Tiny da loja, muito EAN está no SKU). SKU
 * com letras ("areia-bio-3kg") fica só como SKU.
 */
export function codigoDoCandidato(c: Pick<CandidatoTiny, 'gtin' | 'codigo'>): { barcode: string | null; sku: string | null } {
  const barcode = soDigitos(c.gtin) ?? soDigitos(c.codigo);
  const sku = c.codigo && c.codigo !== barcode ? c.codigo : null;
  return { barcode, sku };
}

/** A regra da dona, conferida de novo aqui: sem foto ou sem código não entra. */
export function candidatoCompleto(c: CandidatoTiny): boolean {
  return c.fotos.length > 0 && Boolean(c.gtin || c.codigo);
}

export interface FalhaPuxar {
  tiny_id: string;
  nome: string;
  erro: string;
}

/** Grava os escolhidos no catálogo, em lotes. Devolve quem falhou. */
export async function puxarCandidatos(
  escolhidos: CandidatoTiny[],
  categorias: Categoria[],
  aoAvancar: (feitos: number) => void,
): Promise<FalhaPuxar[]> {
  const falhas: FalhaPuxar[] = [];
  const linha = (c: CandidatoTiny) => ({
    name: c.nome,
    ...codigoDoCandidato(c),
    brand: c.marca,
    supplier: c.fornecedor,
    category_id: acharCategoria(c.categoria, categorias),
    source: 'erp',
    external_id: c.tiny_id,
    photo_source_url: c.fotos[0],
    photo_updated_at: new Date().toISOString(),
    status: 'ativo', // todos têm foto
  });
  const completos = escolhidos.filter(candidatoCompleto);
  let feitos = 0;
  for (let i = 0; i < completos.length; i += 50) {
    const lote = completos.slice(i, i + 50);
    const { error } = await supabase.from('products').insert(lote.map(linha));
    if (error) {
      // um código repetido derruba o lote inteiro: tenta um a um para achar quem
      for (const c of lote) {
        const r = await supabase.from('products').insert(linha(c));
        if (r.error) falhas.push({ tiny_id: c.tiny_id, nome: c.nome, erro: r.error.message });
      }
    }
    feitos += lote.length;
    aoAvancar(feitos);
  }
  return falhas;
}

// ---------------------------------------------------------------------------
// Busca por nome — para produto que ainda não tem EAN no Tiny (variação de
// cor recém-criada, por exemplo). O EAN é gerado aqui, na faixa interna.
// ---------------------------------------------------------------------------

export interface DetalheTiny {
  marca: string | null;
  fornecedor: string | null;
  categoria: string | null;
  fotos: string[];
  kit: boolean;
}

export interface ItemBuscaTiny {
  tiny_id: string;
  nome: string;
  gtin: string | null;
  codigo: string | null;
  situacao: string | null;
  tipo_variacao: string | null;
  /** Só vem para quem pode virar produto (não "pai", não kit), até 15 por busca. */
  detalhe: DetalheTiny | null;
}

export async function buscarTinyPorNome(nome: string): Promise<{ itens: ItemBuscaTiny[]; total: number }> {
  const { data, error } = await supabase.functions.invoke('tiny-produto', { body: { nome } });
  if (error) throw new Error(await erroDaFuncao(error));
  return data as { itens: ItemBuscaTiny[]; total: number };
}

/** Quais itens da busca já estão no catálogo (pelo id do Tiny, EAN ou SKU). */
export async function jaNoCatalogo(itens: ItemBuscaTiny[]): Promise<Map<string, string>> {
  const ids = itens.map((i) => i.tiny_id);
  const codigos = [...new Set(itens.flatMap((i) => [i.gtin, i.codigo]).filter((c): c is string => Boolean(c)))];
  const lista = (xs: string[]) => xs.map((x) => `"${x.replace(/"/g, '')}"`).join(',');
  const filtros = [`external_id.in.(${lista(ids)})`];
  if (codigos.length) filtros.push(`barcode.in.(${lista(codigos)})`, `sku.in.(${lista(codigos)})`);
  const { data, error } = await supabase.from('products').select('id, external_id, barcode, sku').or(filtros.join(','));
  if (error) throw error;
  const achado = new Map<string, string>(); // tiny_id → id do produto no catálogo
  for (const i of itens) {
    const p = (data ?? []).find(
      (p) => p.external_id === i.tiny_id ||
        (p.barcode && (p.barcode === i.gtin || p.barcode === i.codigo)) ||
        (p.sku && p.sku === i.codigo),
    );
    if (p) achado.set(i.tiny_id, p.id as string);
  }
  return achado;
}

/** Códigos internos já usados (faixa 2), para gerar os próximos sem repetir. */
async function eansInternosExistentes(): Promise<string[]> {
  const todos: string[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from('products')
      .select('barcode')
      .like('barcode', '2%')
      .order('barcode')
      .range(de, de + 999);
    if (error) throw error;
    todos.push(...(data ?? []).map((r) => r.barcode as string));
    if (!data || data.length < 1000) break;
  }
  return todos;
}

export interface Importado {
  id: string;
  nome: string;
  barcode: string | null;
  eanGerado: boolean;
}

/**
 * Cria no catálogo os itens escolhidos na busca por nome. Quem não tem EAN
 * no Tiny ganha um EAN interno (faixa 2). Sem foto não entra — nunca.
 */
export async function importarDoTiny(
  itens: ItemBuscaTiny[],
  categorias: Categoria[],
): Promise<{ importados: Importado[]; falhas: FalhaPuxar[] }> {
  const importados: Importado[] = [];
  const falhas: FalhaPuxar[] = [];
  const internos = await eansInternosExistentes();
  for (const i of itens) {
    const d = i.detalhe;
    if (!d || d.fotos.length === 0) {
      falhas.push({ tiny_id: i.tiny_id, nome: i.nome, erro: 'sem foto no Tiny' });
      continue;
    }
    if (d.kit) {
      falhas.push({ tiny_id: i.tiny_id, nome: i.nome, erro: 'kit não entra no catálogo' });
      continue;
    }
    let { barcode, sku } = codigoDoCandidato(i);
    const eanGerado = !barcode;
    if (!barcode) {
      barcode = nextInternalEan(internos);
      internos.push(barcode);
    }
    const { data, error } = await supabase
      .from('products')
      .insert({
        name: i.nome,
        barcode,
        sku,
        brand: d.marca,
        supplier: d.fornecedor,
        category_id: acharCategoria(d.categoria, categorias),
        source: 'erp',
        external_id: i.tiny_id,
        photo_source_url: d.fotos[0],
        photo_updated_at: new Date().toISOString(),
        status: 'ativo', // tem foto
      })
      .select('id')
      .single();
    if (error) falhas.push({ tiny_id: i.tiny_id, nome: i.nome, erro: error.message });
    else importados.push({ id: data.id as string, nome: i.nome, barcode, eanGerado });
  }
  return { importados, falhas };
}
