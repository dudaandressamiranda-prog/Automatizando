/**
 * Lote e validade a partir do texto que a câmera leu (OCR).
 *
 * Mesmas regras do app avulso `lotes-validades/parser.js` — se mudar uma
 * regra aqui, mude lá também. Os testes ficam em `app/test/loteParser.test.ts`.
 */

export interface DataLida {
  /** Como aparece para a pessoa: "15/08/2026" ou "08/2026". */
  texto: string;
  /** Data para o banco. Só mês/ano vira o último dia do mês. */
  iso: string;
  /** A embalagem só trazia mês e ano. */
  soMes: boolean;
}

const MESES: Record<string, number> = {
  JAN: 1, FEV: 2, FEB: 2, MAR: 3, ABR: 4, APR: 4, MAI: 5, MAY: 5,
  JUN: 6, JUL: 7, AGO: 8, AUG: 8, SET: 9, SEP: 9, OUT: 10, OCT: 10,
  NOV: 11, DEZ: 12, DEC: 12,
};
const MES_NOMES = Object.keys(MESES).join('|');

// Palavras que indicam que a data a seguir é a validade / a fabricação.
const KW_VALIDADE =
  /(?:^|[^A-Z])(VALIDADE|VALID|VAL|VENCIMENTO|VENC|VCTO|VTO|EXPIRY|EXPIRA|EXP|USE ATE|CONSUMIR ATE|BEST BEFORE|BB|V)\s*[:.-]?\s*$/;
const KW_FABRICACAO =
  /(?:^|[^A-Z])(FABRICACAO|FABRICADO|FABR|FAB|MFG|MFD|PRODUCAO|PROD|DATA FAB|F)\s*[:.-]?\s*$/;
// Palavras que encerram o código do lote quando o OCR "cola" tudo.
const CORTE_LOTE = /(VALIDADE|VAL|VENC|VCTO|EXP|FAB|MFG|MFD|PROD|DATA)/;

/** Maiúsculas, sem acentos e sem caracteres estranhos do OCR. */
export function normalizarOcr(texto: string): string {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[|¦]/g, 'I')
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[\t ]+/g, ' ');
}

/** Corrige letras que o OCR confunde com números dentro de datas (O→0, I→1, S→5...). */
function corrigirDigitosEmDatas(texto: string): string {
  const mapa: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', S: '5', B: '8', Z: '2', G: '6' };
  return texto.replace(
    /(^|[^A-Z0-9])([0-9OQDILSBZG]{1,4}(?: ?[/.-] ?[0-9OQDILSBZG]{1,4}){1,2})(?=$|[^A-Z0-9])/g,
    (m, antes: string, bloco: string) => {
      const digitos = (bloco.match(/[0-9]/g) || []).length;
      if (digitos < 2) return m;
      return antes + bloco.replace(/[OQDILSBZG]/g, (c) => mapa[c]!);
    },
  );
}

const ano4 = (a: string) => (a.length <= 2 ? 2000 + parseInt(a, 10) : parseInt(a, 10));
const ultimoDiaDoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, '0');

function montarData(dia: number | null, mes: number, ano: number): DataLida | null {
  if (!(mes >= 1 && mes <= 12)) return null;
  if (!(ano >= 2000 && ano <= 2099)) return null;
  if (dia != null) {
    if (!(dia >= 1 && dia <= ultimoDiaDoMes(ano, mes))) return null;
    return { texto: `${pad(dia)}/${pad(mes)}/${ano}`, iso: `${ano}-${pad(mes)}-${pad(dia)}`, soMes: false };
  }
  // Só mês/ano: vale até o último dia do mês.
  return { texto: `${pad(mes)}/${ano}`, iso: `${ano}-${pad(mes)}-${pad(ultimoDiaDoMes(ano, mes))}`, soMes: true };
}

interface DataNoTexto extends DataLida {
  inicio: number;
  fim: number;
  tipo?: 'validade' | 'fabricacao' | 'desconhecida';
}

/** Encontra todas as datas do texto, com a posição de cada uma. */
function encontrarDatas(texto: string): DataNoTexto[] {
  const datas: DataNoTexto[] = [];
  const ocupado = new Array<boolean>(texto.length).fill(false);
  const padroes: { re: RegExp; fn: (m: RegExpExecArray) => DataLida | null }[] = [
    // 15/03/2027 · 15.03.27 · 15-03-2027
    {
      re: /(?<![0-9])(\d{1,2}) ?[/.-] ?(\d{1,2}) ?[/.-] ?(\d{4}|\d{2})(?![0-9])/g,
      fn: (m) => montarData(+m[1]!, +m[2]!, ano4(m[3]!)),
    },
    // 15 MAR 2027 · 15/MAR/27
    {
      re: new RegExp(`(?<![0-9])(\\d{1,2}) ?[/.\\-]? ?(${MES_NOMES}) ?[/.\\-]? ?(\\d{4}|\\d{2})(?![0-9])`, 'g'),
      fn: (m) => montarData(+m[1]!, MESES[m[2]!]!, ano4(m[3]!)),
    },
    // MAR/2027 · MAR 27
    {
      re: new RegExp(`(?<![A-Z])(${MES_NOMES}) ?[/.\\-]? ?(\\d{4}|\\d{2})(?![0-9])`, 'g'),
      fn: (m) => montarData(null, MESES[m[1]!]!, ano4(m[2]!)),
    },
    // 03/2027 · 03-27 · 3.2027
    {
      re: /(?<![0-9/.-])(\d{1,2}) ?[/.-] ?(\d{4}|\d{2})(?![0-9])/g,
      fn: (m) => montarData(null, +m[1]!, ano4(m[2]!)),
    },
  ];

  for (const { re, fn } of padroes) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(texto))) {
      const ini = m.index;
      const fim = ini + m[0].length;
      if (ocupado.slice(ini, fim).some(Boolean)) continue;
      const data = fn(m);
      if (!data) continue;
      ocupado.fill(true, ini, fim);
      datas.push({ ...data, inicio: ini, fim });
    }
  }
  return datas.sort((a, b) => a.inicio - b.inicio);
}

/** Olha o texto logo antes da data para saber se é validade ou fabricação. */
function classificar(texto: string, data: DataNoTexto, anterior?: DataNoTexto): DataNoTexto['tipo'] {
  const desde = anterior ? anterior.fim : 0;
  const antes = texto.slice(Math.max(desde, data.inicio - 30), data.inicio).replace(/\n/g, ' ').trimEnd();
  if (KW_VALIDADE.test(antes)) return 'validade';
  if (KW_FABRICACAO.test(antes)) return 'fabricacao';
  // Palavra-chave um pouco mais longe (ex.: "VAL. 12/2027" com lixo do OCR no meio).
  if (/(VALIDADE|VENC|EXP|VAL)/.test(antes) && !/(FAB|MFG|PROD)/.test(antes)) return 'validade';
  if (/(FAB|MFG|MFD|PROD)/.test(antes)) return 'fabricacao';
  return 'desconhecida';
}

const semPosicao = (d: DataNoTexto): DataLida => ({ texto: d.texto, iso: d.iso, soMes: d.soMes });

/** Extrai a validade do texto do OCR. */
export function extrairValidade(textoOcr: string): DataLida | null {
  const texto = corrigirDigitosEmDatas(normalizarOcr(textoOcr));
  const datas = encontrarDatas(texto);
  if (!datas.length) return null;
  datas.forEach((d, i) => (d.tipo = classificar(texto, d, datas[i - 1])));

  const marcada = datas.find((d) => d.tipo === 'validade');
  // Sem palavra-chave: a validade é a data mais distante (fabricação vem antes).
  const escolhida =
    marcada ??
    datas.filter((d) => d.tipo !== 'fabricacao').sort((a, b) => b.iso.localeCompare(a.iso))[0];
  return escolhida ? semPosicao(escolhida) : null;
}

/** Extrai o código do lote do texto do OCR. */
export function extrairLote(textoOcr: string): string | null {
  const linhas = normalizarOcr(textoOcr).split('\n');
  const padroes = [
    // LOTE: AB1234 · LOT AB1234 · LT.AB1234 · LOTE Nº 123
    /(?:^|[^A-Z])(?:LOTE|LOT|LT)\s*(?:N\s?[O°º.]?\s*)?[:.\-#]?\s*([A-Z0-9][A-Z0-9\-/]{1,24})/,
    // L: AB1234 · L.1234
    /(?:^|[^A-Z0-9])L\s*[:.\-#]\s*([A-Z0-9][A-Z0-9\-/]{1,24})/,
    // L1234
    /(?:^|[^A-Z0-9])L(\d[A-Z0-9\-/]{2,24})/,
  ];
  for (const re of padroes) {
    for (const linha of linhas) {
      const m = linha.match(re);
      if (!m) continue;
      let valor = m[1]!;
      const corte = valor.slice(1).search(CORTE_LOTE);
      if (corte >= 0) valor = valor.slice(0, corte + 1);
      valor = valor.replace(/[-/.]+$/, '');
      if (valor.length < 2 || !/\d/.test(valor)) continue;
      // Não confundir uma data com lote (ex.: "L 12/2027" mal lido).
      if (/^\d{1,2}[/-]\d{2,4}([/-]\d{2,4})?$/.test(valor)) continue;
      return valor;
    }
  }
  return null;
}

/** Lê o texto inteiro do OCR e devolve lote e validade (o que achar). */
export function interpretarOcr(textoOcr: string): { lote: string | null; validade: DataLida | null } {
  return { lote: extrairLote(textoOcr), validade: extrairValidade(textoOcr) };
}

/** Validade digitada à mão (dd/mm/aaaa, mm/aaaa, MAR/2027...). */
export function lerDataDigitada(valor: string): DataLida | null {
  const datas = encontrarDatas(corrigirDigitosEmDatas(normalizarOcr(valor).trim()));
  return datas.length === 1 ? semPosicao(datas[0]!) : null;
}

/**
 * Códigos GS1 (DataMatrix de medicamentos, GS1-128) já trazem GTIN (01),
 * validade (17) e lote (10) dentro do próprio código. Aceita o formato cru
 * (separador FNC1 = \x1d) ou com parênteses. Null se não for GS1.
 */
export function lerGs1(codigo: string): { gtin: string; lote: string | null; validade: DataLida | null } | null {
  let s = String(codigo || '').trim();
  s = s.replace(/^\](d2|C1|Q3|e0)/, '').replace(/^\x1d/, '');
  if (/^\(\d{2,4}\)/.test(s)) {
    // (01)07891234567895(17)270331(10)AB123 → formato cru com separadores
    s = s.replace(/\((\d{2,4})\)/g, '\x1d$1').replace(/^\x1d/, '');
  }
  // Um EAN/UPC comum (só dígitos, até 14) não é GS1, mesmo começando com "01".
  if (/^\d{1,14}$/.test(s) || !/^(01|02|10|11|17|21)/.test(s)) return null;

  const fixos: Record<string, number> = { '00': 18, '01': 14, '02': 14, '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6, '20': 2 };
  const variaveis = ['10', '21', '22', '30', '37', '90', '91', '92', '93', '94', '95', '96', '97', '98', '99'];
  const campos: Record<string, string> = {};
  let i = 0;
  while (i < s.length) {
    if (s[i] === '\x1d') { i++; continue; }
    const ai = s.slice(i, i + 2);
    if (fixos[ai]) {
      campos[ai] = s.slice(i + 2, i + 2 + fixos[ai]!);
      i += 2 + fixos[ai]!;
    } else if (variaveis.includes(ai)) {
      const fim = s.indexOf('\x1d', i + 2);
      campos[ai] = s.slice(i + 2, fim < 0 ? s.length : fim);
      i = fim < 0 ? s.length : fim + 1;
    } else if (/^24[01]$/.test(s.slice(i, i + 3))) {
      const fim = s.indexOf('\x1d', i + 3);
      i = fim < 0 ? s.length : fim + 1;
    } else {
      break;
    }
  }
  const gtin = campos['01'] ?? campos['02'];
  if (!gtin || !/^\d{14}$/.test(gtin)) return null;

  let validade: DataLida | null = null;
  const v = campos['17'];
  if (v && /^\d{6}$/.test(v)) {
    const dia = +v.slice(4, 6);
    validade = montarData(dia === 0 ? null : dia, +v.slice(2, 4), 2000 + +v.slice(0, 2));
  }
  return { gtin, lote: campos['10'] ?? null, validade };
}

/** GTIN-14 com zero à esquerda vira o EAN-13 que está na caixa. */
export function gtinParaEan(gtin: string): string {
  return /^0\d{13}$/.test(gtin) ? gtin.slice(1) : gtin;
}
