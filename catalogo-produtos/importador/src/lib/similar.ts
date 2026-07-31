/**
 * Casamento de nome de produto entre o catálogo e as planilhas de origem.
 *
 * O nome do mesmo produto muda de sistema para sistema — "Ração p/ Cães
 * 15kg" no ERP, "RACAO PARA CAO 15 KG" no painel. Aqui a comparação é por
 * palavra normalizada e pesada por raridade: "para" não vale nada,
 * "apoquel" vale muito, então nome genérico não puxa casamento errado.
 *
 * O que NUNCA pode passar é medida trocada — herdar o EAN do 10 kg para o
 * 15 kg estraga a etiqueta e a venda. Por isso dose, peso e volume são
 * comparados unidade a unidade, fora da nota.
 */
import path from 'node:path';
import { detectColumns } from './columns.js';
import { cleanBarcode, isValidEan, norm } from './normalize.js';
import { readSpreadsheet } from './parse.js';

/** Palavras que não distinguem produto nenhum. */
const VAZIAS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'com', 'para', 'a', 'o', 'os', 'as',
  'em', 'no', 'na', 'nos', 'nas', 'ao', 'aos', 'por', 'the', 'un',
]);

/** Abreviação → palavra inteira. Aplicado token a token. */
const SINONIMOS: Record<string, string> = {
  'p': 'para', 'pra': 'para', 'c': 'com', 's': 'sem',
  'caes': 'cao', 'cachorro': 'cao', 'cachorros': 'cao', 'caninos': 'cao', 'canino': 'cao',
  'gatos': 'gato', 'felino': 'gato', 'felinos': 'gato',
  'adultos': 'adulto', 'filhotes': 'filhote', 'racas': 'raca',
  'comp': 'comprimido', 'cpr': 'comprimido', 'comprimidos': 'comprimido', 'cp': 'comprimido',
  'caps': 'capsula', 'capsulas': 'capsula',
  'cx': 'caixa', 'caixas': 'caixa', 'pct': 'pacote', 'pacotes': 'pacote',
  'und': 'unidade', 'unid': 'unidade', 'unidades': 'unidade', 'uni': 'unidade',
  'racoes': 'racao',
  'saches': 'sache', 'sachet': 'sache', 'sachets': 'sache',
  'petiscos': 'petisco', 'brinquedos': 'brinquedo', 'coleiras': 'coleira',
  'shamp': 'shampoo', 'xampu': 'shampoo',
  'antipulga': 'antipulgas', 'vermifugos': 'vermifugo',
  'tam': 'tamanho', 'pq': 'pequeno', 'peq': 'pequeno', 'med': 'medio', 'gde': 'grande', 'gr': 'grande',
};

/** Unidade de medida → forma canônica. */
const UNIDADES: Record<string, string> = {
  kg: 'kg', kgs: 'kg', quilo: 'kg', quilos: 'kg', k: 'kg',
  g: 'g', gr: 'g', grs: 'g', grama: 'g', gramas: 'g',
  mg: 'mg', mcg: 'mcg',
  ml: 'ml', l: 'l', lt: 'l', lts: 'l', litro: 'l', litros: 'l',
  cm: 'cm', mm: 'mm', m: 'm', pol: 'pol',
  un: 'un', und: 'un', unidade: 'un', unidades: 'un',
  comp: 'comprimido', comprimido: 'comprimido', comprimidos: 'comprimido',
};

const CANONICAS = new Set(Object.values(UNIDADES));

/** "2,5" e "2.50" e "2" viram a mesma coisa; "015" vira "15". */
function numeroCanonico(n: string): string {
  const v = Number(n.replace(',', '.'));
  return Number.isFinite(v) ? String(v) : n;
}

/**
 * Quebra o nome em palavras comparáveis.
 * "Ração p/ Cães Adultos 15kg" → ["racao","cao","adulto","15","kg"]
 */
export function tokens(txt: string): string[] {
  const cru = norm(txt)
    .replace(/(\d)[,.](\d)/g, '$1_$2') // protege o decimal antes de picar
    .split(/[^a-z0-9_]+/)
    .filter(Boolean);

  const saida: string[] = [];
  for (const bruto of cru) {
    const t = bruto.replace('_', ',');
    // "500ml" / "2,5kg" → número + unidade
    const m = /^(\d+(?:,\d+)?)([a-z]+)$/.exec(t);
    if (m) {
      saida.push(numeroCanonico(m[1]!));
      saida.push(UNIDADES[m[2]!] ?? m[2]!);
      continue;
    }
    if (/^\d+(?:,\d+)?$/.test(t)) {
      saida.push(numeroCanonico(t));
      continue;
    }
    const canon = UNIDADES[t] ?? SINONIMOS[t] ?? t;
    if (!VAZIAS.has(canon)) saida.push(canon);
  }
  return saida;
}

/**
 * Assinatura de medida, agrupada por unidade: {kg:["10"], comprimido:["3"]}.
 * Número sem unidade ("4,1 a 10kg", "50X90") entra no grupo vazio.
 */
export function medidas(ts: string[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (let i = 0; i < ts.length; i++) {
    if (!/^\d+(?:\.\d+)?$/.test(ts[i]!)) continue;
    const prox = ts[i + 1];
    const unidade = prox && CANONICAS.has(prox) ? prox : '';
    const lista = m.get(unidade);
    if (lista) lista.push(ts[i]!);
    else m.set(unidade, [ts[i]!]);
  }
  for (const lista of m.values()) lista.sort();
  return m;
}

export type Relacao = 'igual' | 'planilha-extra' | 'catalogo-extra' | 'conflito';

/**
 * Compara medida por medida, unidade a unidade.
 *
 * Divergência dentro da MESMA unidade é produto diferente e reprova: 10 kg
 * contra 15 kg, 1 comprimido contra 3. Já unidade que só um dos lados
 * declara não reprova — é o caso do cadastro pai ("NexGard 4,1 a 10kg")
 * contra a linha que detalha a embalagem ("… - 3 comprimidos"). Esse a
 * gente quer VER, com a ressalva anotada.
 */
export function compararMedidas(a: Map<string, string[]>, b: Map<string, string[]>): Relacao {
  let soA = false;
  let soB = false;
  for (const unidade of new Set([...a.keys(), ...b.keys()])) {
    const va = a.get(unidade);
    const vb = b.get(unidade);
    if (va && vb) {
      if (va.length !== vb.length || va.some((v, i) => v !== vb[i])) return 'conflito';
    } else if (va) soA = true;
    else soB = true;
  }
  if (soA && soB) return 'conflito';
  if (soB) return 'planilha-extra';
  if (soA) return 'catalogo-extra';
  return 'igual';
}

/** Contagem por palavra — repetição importa ("Lazy Dog - Lazy Dog"). */
export function contar(ts: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of ts) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

/** Mesmas palavras nas mesmas quantidades — casamento perfeito. */
export function multisetIgual(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [t, n] of a) if (b.get(t) !== n) return false;
  return true;
}

/** Uma linha de planilha já preparada para comparação. */
export interface Fonte {
  nome: string;
  ean: string;
  marca: string;
  origem: string;
  eanValido: boolean;
  toks: string[];
  conta: Map<string, number>;
  meds: Map<string, string[]>;
}

export interface Candidato {
  f: Fonte;
  score: number;
  rel: Relacao;
  exato: boolean;
}

/** Lê as planilhas e prepara toda linha que tenha nome e algum código. */
export async function carregarFontes(arquivos: string[]): Promise<Fonte[]> {
  const fontes: Fonte[] = [];
  for (const arq of arquivos) {
    const rotulo = path.basename(arq);
    const { headers, records } = await readSpreadsheet(arq);
    const { map } = detectColumns(headers);
    if (!map.name) {
      console.log(`  ⚠ ${rotulo}: sem coluna de nome — ignorado.`);
      continue;
    }
    const texto = (r: Record<string, unknown>, c?: string) =>
      c && r[c] != null ? String(r[c]).trim() : '';

    let usados = 0;
    for (const r of records) {
      const nome = texto(r, map.name);
      if (!nome) continue;

      // GTIN é o campo certo; o SKU só vale quando é um EAN de verdade,
      // e no painel do chefe ele quase sempre é.
      const candidatos = [texto(r, map.barcode), texto(r, map.sku)];
      let ean = '';
      let valido = false;
      for (const c of candidatos) {
        const limpo = cleanBarcode(c || null);
        if (!limpo.ok || !limpo.value) continue;
        if (isValidEan(limpo.value)) { ean = limpo.value; valido = true; break; }
        if (!ean) ean = limpo.value; // guarda como reserva, sem dígito fechando
      }
      if (!ean) continue;

      const ts = tokens(nome);
      if (ts.length === 0) continue;
      fontes.push({
        nome, ean, origem: rotulo, eanValido: valido,
        marca: norm(texto(r, map.brand)),
        toks: ts, conta: contar(ts), meds: medidas(ts),
      });
      usados++;
    }
    console.log(`  ${rotulo}: ${usados} linhas com código aproveitável (de ${records.length}).`);
  }
  return fontes;
}

/**
 * Índice das planilhas: guarda o peso de cada palavra e em quais linhas ela
 * aparece, para não comparar cada produto com as 18 mil linhas.
 */
export class Indice {
  private readonly idf = new Map<string, number>();
  private readonly porToken = new Map<string, Fonte[]>();

  constructor(readonly fontes: Fonte[]) {
    const docs = fontes.length;
    const emQuantos = new Map<string, number>();
    for (const f of fontes) {
      for (const t of new Set(f.toks)) emQuantos.set(t, (emQuantos.get(t) ?? 0) + 1);
    }
    for (const [t, n] of emQuantos) this.idf.set(t, Math.log(docs / n) + 0.5);

    for (const f of fontes) {
      for (const t of new Set(f.toks)) {
        if ((emQuantos.get(t) ?? 0) > docs * 0.25) continue; // palavra banal não indexa
        const lista = this.porToken.get(t);
        if (lista) lista.push(f);
        else this.porToken.set(t, [f]);
      }
    }
  }

  /** Dice ponderado por raridade: 1 = mesmas palavras nas mesmas quantidades. */
  private nota(a: Map<string, number>, b: Map<string, number>): number {
    const peso = (t: string) => this.idf.get(t) ?? 6; // palavra inédita = bem específica
    let comum = 0;
    let totalA = 0;
    let totalB = 0;
    for (const [t, n] of a) totalA += n * peso(t);
    for (const [t, n] of b) {
      totalB += n * peso(t);
      const na = a.get(t);
      if (na) comum += Math.min(na, n) * peso(t);
    }
    return totalA + totalB === 0 ? 0 : (2 * comum) / (totalA + totalB);
  }

  /**
   * Candidatos ordenados: casamento perfeito de palavras na frente, depois
   * por nota. Quem conflita em medida ou em marca nem entra na lista —
   * `reprovado` conta o melhor deles, só para o relatório explicar por quê.
   */
  procurar(nome: string, marcaProduto: string | null, minimo = 0.6): {
    candidatos: Candidato[];
    reprovado: string;
  } {
    const ts = tokens(nome);
    const conta = contar(ts);
    const meds = medidas(ts);
    const marca = norm(marcaProduto);

    const vistos = new Set<Fonte>();
    for (const t of new Set(ts)) {
      for (const f of this.porToken.get(t) ?? []) vistos.add(f);
    }

    const candidatos: Candidato[] = [];
    let reprovado = '';
    for (const f of vistos) {
      const score = this.nota(conta, f.conta);
      if (score < minimo) continue;
      // marca declarada dos dois lados e diferente → nem avalia
      if (marca && f.marca && marca !== f.marca && !f.toks.includes(marca) && !ts.includes(f.marca)) continue;
      const rel = compararMedidas(meds, f.meds);
      if (rel === 'conflito') {
        if (!reprovado) reprovado = `${f.nome} [${f.ean}] — medida diferente`;
        continue;
      }
      candidatos.push({ f, score, rel, exato: multisetIgual(conta, f.conta) });
    }
    candidatos.sort((a, b) => Number(b.exato) - Number(a.exato) || b.score - a.score);
    return { candidatos, reprovado };
  }
}
