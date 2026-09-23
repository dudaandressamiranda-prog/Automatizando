/**
 * Leitura do XML da NF-e.
 *
 * A nota já traz muito do que o cadastro precisa, e duas coisas em
 * particular poupam trabalho:
 *
 * - O fornecedor vem no emitente, então não é preciso digitar.
 * - A conversão de unidade vem de graça: a nota declara a unidade
 *   COMERCIAL (uCom/qCom — "10 CX") e a TRIBUTÁVEL (uTrib/qTrib —
 *   "120 UN"). Dividir uma pela outra dá quantas unidades vêm na caixa,
 *   sem ninguém precisar contar.
 *
 * Também existem dois códigos de barras por item: cEAN é o da embalagem
 * comprada (a caixa) e cEANTrib o da unidade de venda. Para o catálogo,
 * que é consultado com o produto na mão, o que vale é o da unidade.
 */

export interface ItemNota {
  /** Número do item na nota (nItem), para conferência com o papel. */
  numero: number;
  descricao: string;
  /** Código do produto no sistema do fornecedor. */
  codigoFornecedor: string;
  /** EAN da unidade de venda — é o que interessa ao catálogo. */
  ean: string | null;
  /** EAN da embalagem comprada, quando difere do da unidade. */
  eanEmbalagem: string | null;
  unidadeComercial: string;
  quantidadeComercial: number;
  unidadeTributavel: string;
  quantidadeTributavel: number;
  /** Unidades por embalagem, deduzido da própria nota. 1 = já vem avulso. */
  fatorConversao: number;
  valorUnitario: number;
  valorTotal: number;
  ncm: string;
}

export interface Nota {
  numero: string;
  emissao: string;
  fornecedor: string;
  cnpj: string;
  itens: ItemNota[];
}

/** Busca por nome local, ignorando o prefixo de namespace do XML. */
function filhos(pai: Element | Document, nome: string): Element[] {
  const todos = pai.getElementsByTagName('*');
  const achados: Element[] = [];
  for (let i = 0; i < todos.length; i++) {
    const el = todos[i]!;
    if (el.localName === nome) achados.push(el);
  }
  return achados;
}

function texto(pai: Element, nome: string): string {
  const el = filhos(pai, nome)[0];
  return el?.textContent?.trim() ?? '';
}

function numero(pai: Element, nome: string): number {
  const v = Number(texto(pai, nome));
  return Number.isFinite(v) ? v : 0;
}

/** EAN "SEM GTIN" é o preenchimento padrão de quem não tem código. */
function limpaEan(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  return /^\d{8}$|^\d{12,14}$/.test(d) ? d : null;
}

export function parseNfe(xml: string): Nota {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Arquivo não é um XML válido.');
  }

  const infNFe = filhos(doc, 'infNFe')[0];
  if (!infNFe) {
    throw new Error('Não achei a nota dentro do arquivo. Envie o XML da NF-e (não o DANFE em PDF).');
  }

  const ide = filhos(infNFe, 'ide')[0];
  const emit = filhos(infNFe, 'emit')[0];

  const itens: ItemNota[] = [];
  for (const det of filhos(infNFe, 'det')) {
    const prod = filhos(det, 'prod')[0];
    if (!prod) continue;

    const qCom = numero(prod, 'qCom');
    const qTrib = numero(prod, 'qTrib');
    const uCom = texto(prod, 'uCom').toUpperCase();
    const uTrib = texto(prod, 'uTrib').toUpperCase();

    // Fator só faz sentido quando as unidades diferem e as contas fecham.
    // Nota que declara tudo igual (10 UN / 10 UN) tem fator 1.
    let fator = 1;
    if (qCom > 0 && qTrib > 0 && uCom !== uTrib) {
      const f = qTrib / qCom;
      if (Number.isFinite(f) && f > 0) fator = Math.round(f * 1000) / 1000;
    }

    itens.push({
      numero: Number(det.getAttribute('nItem') ?? itens.length + 1),
      descricao: texto(prod, 'xProd'),
      codigoFornecedor: texto(prod, 'cProd'),
      ean: limpaEan(texto(prod, 'cEANTrib')) ?? limpaEan(texto(prod, 'cEAN')),
      eanEmbalagem: limpaEan(texto(prod, 'cEAN')),
      unidadeComercial: uCom,
      quantidadeComercial: qCom,
      unidadeTributavel: uTrib,
      quantidadeTributavel: qTrib,
      fatorConversao: fator,
      valorUnitario: numero(prod, 'vUnCom'),
      valorTotal: numero(prod, 'vProd'),
      ncm: texto(prod, 'NCM'),
    });
  }

  if (itens.length === 0) throw new Error('A nota não tem itens.');

  return {
    numero: ide ? texto(ide, 'nNF') : '',
    emissao: ide ? (texto(ide, 'dhEmi') || texto(ide, 'dEmi')).slice(0, 10) : '',
    fornecedor: emit ? texto(emit, 'xNome') : '',
    cnpj: emit ? texto(emit, 'CNPJ') : '',
    itens,
  };
}

/** Unidades que costumam vir em nota, para o seletor de conversão. */
export const UNIDADES = ['UN', 'CX', 'PC', 'PCT', 'FD', 'DZ', 'KG', 'LT', 'SC', 'FR', 'TB'];
