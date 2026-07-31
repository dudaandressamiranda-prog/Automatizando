/**
 * Busca avançada de código de barras nas planilhas de origem.
 *
 * O `recuperar-ean` só aceita casamento perfeito de palavras — é o que se
 * quer quando o script GRAVA sozinho, mas deixa de fora todo produto cujo
 * nome foi digitado diferente no ERP e no painel ("Ração p/ Cães 15kg" vs
 * "RACAO PARA CAO 15 KG"). Este aqui é o oposto: procura fundo, aceita
 * diferença de escrita e devolve um relatório com nota de confiança para
 * conferência humana.
 *
 * Como procura:
 *  1. normaliza abreviação e unidade — "p/"→"para", "500ml"→"500 ml",
 *     "cx"→"caixa", "comp"→"comprimido", "2,5"→"2.5";
 *  2. separa número+unidade em tokens próprios, porque é neles que mora o
 *     erro caro: herdar o EAN do 10 kg para o 15 kg;
 *  3. pesa cada palavra por raridade (IDF) — "para" não vale nada, "apoquel"
 *     vale muito, então o nome genérico não puxa casamento errado;
 *  4. nota = Dice ponderado entre os dois conjuntos de palavras.
 *
 * Travas (o resultado é sugestão, mas sugestão errada custa caro):
 *  - dose/peso/volume: se os dois nomes trazem número, tem que ser o MESMO
 *    conjunto de medidas; diferente reprova na hora;
 *  - marca declarada nos dois lados e divergente reprova;
 *  - EAN precisa ter dígito verificador válido para entrar como ALTA;
 *  - EAN que já pertence a outro produto do catálogo não é sugerido;
 *  - nome que casa com EANs diferentes é cadastro pai com variações — vai
 *    para a aba de conferência em vez de virar sugestão.
 *
 * Uso:
 *   npm run caca-ean -- planilha-chefe.csv tiny.csv
 *   npm run caca-ean -- planilha.csv --apply         # grava só as ALTA
 *   npm run caca-ean -- planilha.csv --apply --media # inclui as MEDIA
 */
import 'dotenv/config';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import { detectColumns } from './lib/columns.js';
import { cleanBarcode, isValidEan, norm } from './lib/normalize.js';
import { readSpreadsheet } from './lib/parse.js';

const ARQUIVO = 'caca-ean.xlsx';
const VERDE = 'FF25756C';

/** Palavras que não distinguem produto nenhum. */
const VAZIAS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'com', 'para', 'a', 'o', 'os', 'as',
  'em', 'no', 'na', 'nos', 'nas', 'ao', 'aos', 'por', 'the', 'un',
]);

/** Abreviação → palavra inteira. Aplicado token a token. */
const SINONIMOS: Record<string, string> = {
  'p': 'para', 'pra': 'para', 'c': 'com', 's': 'sem',
  'cao': 'cao', 'caes': 'cao', 'cachorro': 'cao', 'cachorros': 'cao', 'caninos': 'cao', 'canino': 'cao',
  'gatos': 'gato', 'felino': 'gato', 'felinos': 'gato',
  'adultos': 'adulto', 'filhotes': 'filhote', 'racas': 'raca',
  'comp': 'comprimido', 'cpr': 'comprimido', 'comprimidos': 'comprimido', 'cp': 'comprimido',
  'caps': 'capsula', 'capsulas': 'capsula',
  'cx': 'caixa', 'caixas': 'caixa', 'pct': 'pacote', 'pacotes': 'pacote',
  'und': 'unidade', 'unid': 'unidade', 'unidades': 'unidade', 'uni': 'unidade',
  'racao': 'racao', 'racoes': 'racao',
  'sache': 'sache', 'saches': 'sache', 'sachet': 'sache', 'sachets': 'sache',
  'petiscos': 'petisco', 'brinquedos': 'brinquedo', 'coleiras': 'coleira',
  'shampoo': 'shampoo', 'shamp': 'shampoo', 'xampu': 'shampoo',
  'antipulga': 'antipulgas', 'vermifugo': 'vermifugo', 'vermifugos': 'vermifugo',
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

/** "2,5" e "2.50" e "2" viram a mesma coisa; "015" vira "15". */
function numeroCanonico(n: string): string {
  const v = Number(n.replace(',', '.'));
  return Number.isFinite(v) ? String(v) : n;
}

/**
 * Quebra o nome em palavras comparáveis.
 * "Ração p/ Cães Adultos 15kg" → ["racao","cao","adulto","15","kg"]
 */
function tokens(txt: string): string[] {
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
 * É a trava contra herdar o EAN do 10 kg para o 15 kg. Número sem unidade
 * ("4,1 a 10kg", "50X90") entra no grupo vazio.
 */
function medidas(ts: string[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  const canonicas = new Set(Object.values(UNIDADES));
  for (let i = 0; i < ts.length; i++) {
    if (!/^\d+(?:\.\d+)?$/.test(ts[i]!)) continue;
    const prox = ts[i + 1];
    const unidade = prox && canonicas.has(prox) ? prox : '';
    const lista = m.get(unidade);
    if (lista) lista.push(ts[i]!);
    else m.set(unidade, [ts[i]!]);
  }
  for (const lista of m.values()) lista.sort();
  return m;
}

type Relacao = 'igual' | 'planilha-extra' | 'catalogo-extra' | 'conflito';

/**
 * Compara medida por medida, unidade a unidade.
 *
 * Divergência dentro da MESMA unidade é produto diferente e reprova: 10 kg
 * contra 15 kg, 1 comprimido contra 3. Já unidade que só um dos lados
 * declara não reprova — é o caso clássico do cadastro pai ("NexGard 4,1 a
 * 10kg") contra a linha da planilha que detalha a embalagem ("… - 3
 * comprimidos"). Esse a gente quer VER, com a ressalva anotada.
 */
function compararMedidas(a: Map<string, string[]>, b: Map<string, string[]>): Relacao {
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

/** Mesmas palavras nas mesmas quantidades — casamento perfeito. */
function multisetIgual(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [t, n] of a) if (b.get(t) !== n) return false;
  return true;
}

/** Contagem por palavra — repetição importa ("Lazy Dog - Lazy Dog"). */
function contar(ts: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of ts) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

/**
 * Dice ponderado por raridade: 2·(peso em comum) / (peso A + peso B).
 * 1 = mesmas palavras nas mesmas quantidades.
 */
function nota(a: Map<string, number>, b: Map<string, number>, idf: Map<string, number>): number {
  const peso = (t: string) => idf.get(t) ?? 6; // palavra inédita = bem específica
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

interface Fonte {
  nome: string;
  ean: string;
  marca: string;
  origem: string;
  eanValido: boolean;
  toks: string[];
  conta: Map<string, number>;
  meds: Map<string, string[]>;
}

interface Prod {
  id: string;
  name: string;
  brand: string | null;
  status: string;
  barcode: string | null;
}

type Confianca = 'ALTA' | 'MEDIA' | 'BAIXA' | 'CODIGO INVÁLIDO';

interface Achado {
  produto: Prod;
  ean: string;
  nomeFonte: string;
  origem: string;
  score: number;
  confianca: Confianca;
  motivo: string;
}

async function carregarFontes(arquivos: string[]): Promise<Fonte[]> {
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
        const ok = isValidEan(limpo.value);
        if (ok) { ean = limpo.value; valido = true; break; }
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

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const incluirMedia = args.includes('--media');
  const arquivos = args.filter((a) => !a.startsWith('--'));
  if (arquivos.length === 0) {
    throw new Error('Informe as planilhas: npm run caca-ean -- chefe.csv tiny.csv');
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.');
  const db = createClient(url, key, { auth: { persistSession: false } });

  console.log('Lendo as planilhas...');
  const fontes = await carregarFontes(arquivos);
  if (fontes.length === 0) throw new Error('Nenhuma linha com código nas planilhas informadas.');

  // IDF: palavra que aparece em quase todo nome quase não pesa
  const docs = fontes.length;
  const emQuantos = new Map<string, number>();
  for (const f of fontes) {
    for (const t of new Set(f.toks)) emQuantos.set(t, (emQuantos.get(t) ?? 0) + 1);
  }
  const idf = new Map<string, number>();
  for (const [t, n] of emQuantos) idf.set(t, Math.log(docs / n) + 0.5);

  // índice invertido: só compara com quem divide alguma palavra rara
  const porToken = new Map<string, Fonte[]>();
  for (const f of fontes) {
    for (const t of new Set(f.toks)) {
      if ((emQuantos.get(t) ?? 0) > docs * 0.25) continue; // palavra banal não indexa
      const lista = porToken.get(t);
      if (lista) lista.push(f);
      else porToken.set(t, [f]);
    }
  }

  console.log('Consultando o catálogo...');
  const prods: Prod[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('products')
      .select('id, name, brand, status, barcode')
      .order('id')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    prods.push(...((data ?? []) as Prod[]));
    if (!data || data.length < 1000) break;
  }
  const jaUsados = new Set(prods.map((p) => p.barcode).filter(Boolean) as string[]);
  const alvos = prods.filter((p) => !p.barcode && p.status === 'ativo');
  console.log(`  ${alvos.length} produtos ativos sem código.`);

  const donoDoEan = new Map<string, string>();
  for (const p of prods) if (p.barcode) donoDoEan.set(p.barcode, p.name);

  const achados: Achado[] = [];
  const variacoes: { nome: string; eans: string[]; exemplos: string; id: string }[] = [];
  const semNada: { p: Prod; quaseFoi: string }[] = [];
  const duplicados: { p: Prod; ean: string; nomeFonte: string; dono: string }[] = [];

  for (const p of alvos) {
    const ts = tokens(p.name);
    const conta = contar(ts);
    const meds = medidas(ts);
    const marca = norm(p.brand);

    // candidatos: quem compartilha ao menos uma palavra indexada
    const vistos = new Set<Fonte>();
    for (const t of new Set(ts)) {
      for (const f of porToken.get(t) ?? []) vistos.add(f);
    }
    if (vistos.size === 0) { semNada.push({ p, quaseFoi: '' }); continue; }

    const pontuados: { f: Fonte; score: number; rel: Relacao; exato: boolean }[] = [];
    let melhorReprovado = '';
    for (const f of vistos) {
      const s = nota(conta, f.conta, idf);
      if (s < 0.6) continue;
      // trava da marca: declarada dos dois lados e diferente → nem avalia
      if (marca && f.marca && marca !== f.marca && !f.toks.includes(marca) && !ts.includes(f.marca)) continue;
      // trava da dose/peso: mesma unidade com valor diferente é outro produto
      const rel = compararMedidas(meds, f.meds);
      if (rel === 'conflito') {
        if (!melhorReprovado) melhorReprovado = `${f.nome} [${f.ean}] — medida diferente`;
        continue;
      }
      pontuados.push({ f, score: s, rel, exato: multisetIgual(conta, f.conta) });
    }
    if (pontuados.length === 0) { semNada.push({ p, quaseFoi: melhorReprovado }); continue; }

    // casamento perfeito de palavras vence qualquer aproximação
    pontuados.sort((a, b) => Number(b.exato) - Number(a.exato) || b.score - a.score);
    let melhor = pontuados[0]!;

    // O primeiro colocado pode trazer um código inventado (é comum no ERP).
    // Se outra linha igualmente boa tem código que fecha o dígito, é ela que
    // vale — a planilha do painel costuma ter o GTIN de verdade.
    if (!melhor.f.eanValido) {
      const bom = pontuados.find(
        (x) => x.f.eanValido && x.exato === melhor.exato && x.score >= melhor.score - 0.05,
      );
      if (bom) melhor = bom;
    }

    // empate técnico em EANs diferentes = cadastro pai com variações
    const iguaisAoMelhor = pontuados.filter(
      (x) => x.exato === melhor.exato && x.score >= melhor.score - 0.02,
    );
    const eansTopo = [...new Set(iguaisAoMelhor.map((x) => x.f.ean))];
    if (eansTopo.length > 1) {
      variacoes.push({
        nome: p.name,
        id: p.id,
        eans: eansTopo.slice(0, 6),
        exemplos: iguaisAoMelhor.slice(0, 3).map((x) => `${x.f.nome} [${x.f.ean}]`).join(' | '),
      });
      continue;
    }

    const ean = melhor.f.ean;
    if (jaUsados.has(ean)) {
      // o código existe, só que já tem dono no catálogo: os dois cadastros
      // são o mesmo produto e o caso é de juntar, não de completar EAN
      duplicados.push({ p, ean, nomeFonte: melhor.f.nome, dono: donoDoEan.get(ean) ?? '' });
      continue;
    }

    // duas planilhas apontando o mesmo código é confirmação independente
    const confirmadoPor = new Set(fontes.filter((f) => f.ean === ean).map((f) => f.origem)).size;

    const motivos: string[] = [];
    if (melhor.rel === 'planilha-extra') motivos.push('planilha detalha embalagem que o catálogo não traz');
    if (melhor.rel === 'catalogo-extra') motivos.push('catálogo traz medida que a planilha não tem');
    if (confirmadoPor > 1) motivos.push('mesmo código nas duas planilhas');

    let confianca: Confianca;
    if (!melhor.f.eanValido) {
      // nome bate, mas o código da planilha é inventado (dígito não fecha)
      motivos.unshift('código da planilha é inválido — dígito verificador não fecha');
      confianca = 'CODIGO INVÁLIDO';
    } else if (melhor.exato && melhor.rel === 'igual') confianca = 'ALTA';
    else if (melhor.score >= 0.9 && melhor.rel !== 'catalogo-extra') confianca = 'ALTA';
    else if (melhor.score >= 0.78) confianca = 'MEDIA';
    else confianca = 'BAIXA';

    achados.push({
      produto: p, ean, nomeFonte: melhor.f.nome, origem: melhor.f.origem,
      score: melhor.score, confianca, motivo: motivos.join('; '),
    });
  }

  // Dois produtos do catálogo apontando para o mesmo código são cadastro
  // repetido: o banco só aceita um dono, então o melhor fica e os outros
  // caem para conferência.
  const porEan = new Map<string, Achado[]>();
  for (const a of achados) {
    const l = porEan.get(a.ean);
    if (l) l.push(a);
    else porEan.set(a.ean, [a]);
  }
  let repetidos = 0;
  for (const lista of porEan.values()) {
    if (lista.length < 2) continue;
    lista.sort((x, y) => y.score - x.score);
    for (const a of lista.slice(1)) {
      a.confianca = 'BAIXA';
      a.motivo = [`cadastro repetido — "${lista[0]!.produto.name}" disputa o mesmo código`, a.motivo]
        .filter(Boolean).join('; ');
      repetidos++;
    }
  }

  const ordem: Record<Confianca, number> = { ALTA: 0, MEDIA: 1, BAIXA: 2, 'CODIGO INVÁLIDO': 3 };
  achados.sort((a, b) => ordem[a.confianca] - ordem[b.confianca] || b.score - a.score);

  const conta = (c: Confianca) => achados.filter((a) => a.confianca === c).length;
  console.log('');
  console.log(`Confiança ALTA  (pode gravar):             ${conta('ALTA')}`);
  console.log(`Confiança MEDIA (conferir por cima):       ${conta('MEDIA')}`);
  console.log(`Confiança BAIXA (conferir um a um):        ${conta('BAIXA')}`);
  console.log(`  destes, cadastro repetido no catálogo:   ${repetidos}`);
  console.log(`Código da planilha inválido (é inventado): ${conta('CODIGO INVÁLIDO')}`);
  console.log(`Cadastro pai com variações (não sugere):   ${variacoes.length}`);
  console.log(`Repetido: o código já tem dono no catálogo:${duplicados.length}`);
  console.log(`Sem nada parecido nas planilhas:           ${semNada.length}`);

  // ---- relatório -------------------------------------------------------
  const wb = new ExcelJS.Workbook();
  const cabecalho = (ws: ExcelJS.Worksheet) => {
    const r = ws.getRow(1);
    r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
    r.height = 22;
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  };

  const ws = wb.addWorksheet('Encontrados');
  ws.columns = [
    { header: 'Confiança', key: 'conf', width: 11 },
    { header: 'Produto no catálogo', key: 'nome', width: 50 },
    { header: 'Código encontrado', key: 'ean', width: 18 },
    { header: 'Nome na planilha', key: 'fonte', width: 50 },
    { header: 'Planilha', key: 'origem', width: 22 },
    { header: 'Nota', key: 'score', width: 8 },
    { header: 'Observação', key: 'motivo', width: 40 },
    { header: 'ID no sistema', key: 'id', width: 38 },
  ];
  const COR: Record<Confianca, string> = {
    ALTA: 'FFE7F5EC', MEDIA: 'FFFFF8E1', BAIXA: 'FFFDEAEA', 'CODIGO INVÁLIDO': 'FFEDE7F6',
  };
  for (const a of achados) {
    const linha = ws.addRow({
      conf: a.confianca, nome: a.produto.name, ean: a.ean, fonte: a.nomeFonte,
      origem: a.origem, score: Number(a.score.toFixed(3)), motivo: a.motivo, id: a.produto.id,
    });
    linha.getCell('ean').numFmt = '@';
    linha.getCell('conf').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR[a.confianca] } };
  }
  ws.autoFilter = 'A1:H1';
  cabecalho(ws);

  const wv = wb.addWorksheet('Variações');
  wv.columns = [
    { header: 'Produto no catálogo', key: 'nome', width: 50 },
    { header: 'Códigos possíveis', key: 'eans', width: 40 },
    { header: 'Nomes na planilha', key: 'exemplos', width: 80 },
    { header: 'ID no sistema', key: 'id', width: 38 },
  ];
  for (const v of variacoes) {
    wv.addRow({ nome: v.nome, eans: v.eans.join(' / '), exemplos: v.exemplos, id: v.id });
  }
  cabecalho(wv);

  const wd = wb.addWorksheet('Cadastro repetido');
  wd.columns = [
    { header: 'Produto sem código', key: 'nome', width: 50 },
    { header: 'Código encontrado', key: 'ean', width: 18 },
    { header: 'Já pertence a', key: 'dono', width: 50 },
    { header: 'Nome na planilha', key: 'fonte', width: 50 },
    { header: 'ID no sistema', key: 'id', width: 38 },
  ];
  for (const d of duplicados) {
    const linha = wd.addRow({
      nome: d.p.name, ean: d.ean, dono: d.dono, fonte: d.nomeFonte, id: d.p.id,
    });
    linha.getCell('ean').numFmt = '@';
  }
  cabecalho(wd);

  const wn = wb.addWorksheet('Sem candidato');
  wn.columns = [
    { header: 'Produto no catálogo', key: 'nome', width: 55 },
    { header: 'Marca', key: 'marca', width: 22 },
    { header: 'Chegou perto mas reprovou', key: 'quase', width: 60 },
    { header: 'ID no sistema', key: 'id', width: 38 },
  ];
  for (const s of semNada) {
    wn.addRow({ nome: s.p.name, marca: s.p.brand ?? '', quase: s.quaseFoi, id: s.p.id });
  }
  cabecalho(wn);

  await wb.xlsx.writeFile(ARQUIVO);
  console.log(`\nRelatório: ${ARQUIVO}`);

  if (!apply) {
    console.log('Nada foi gravado. Rode com --apply para atribuir as ALTA (--media inclui as MEDIA).');
    return;
  }
  const gravar = achados.filter((a) => a.confianca === 'ALTA' || (incluirMedia && a.confianca === 'MEDIA'));
  for (const a of gravar) {
    const { error } = await db.from('products').update({ barcode: a.ean }).eq('id', a.produto.id);
    if (error) throw new Error(`Erro em "${a.produto.name}": ${error.message}`);
  }
  console.log(`\n✅ ${gravar.length} códigos atribuídos.`);
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
