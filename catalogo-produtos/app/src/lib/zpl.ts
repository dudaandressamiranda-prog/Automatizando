/**
 * Gera ZPL — a linguagem que as impressoras Zebra entendem — para etiquetas
 * de código de barras.
 *
 * O código de barras é desenhado pela própria impressora (comando ^BE), não
 * enviado como imagem: sai muito mais nítido e legível ao leitor, que é o
 * que importa numa etiqueta de gôndola.
 *
 * Rolo de várias colunas (3 etiquetas lado a lado, por exemplo) é impresso
 * uma FILEIRA por vez: o ^PW cobre a largura toda da fita e cada etiqueta
 * entra numa posição horizontal. Mandar uma etiqueta por vez desperdiçaria
 * as outras duas colunas da fileira.
 */

/** Modelos de etiqueta em uso na loja, em milímetros. */
export interface FormatoEtiqueta {
  id: string;
  label: string;
  larguraMm: number;
  alturaMm: number;
  /** Etiquetas lado a lado na fita. */
  colunas: number;
  /** Espaço entre uma coluna e a seguinte. */
  gapMm: number;
}

export const FORMATOS: FormatoEtiqueta[] = [
  { id: '30x15x3', label: '30 × 15 mm — 3 colunas', larguraMm: 30, alturaMm: 15, colunas: 3, gapMm: 2 },
  { id: '30x15', label: '30 × 15 mm — 1 coluna', larguraMm: 30, alturaMm: 15, colunas: 1, gapMm: 0 },
  { id: '33x22', label: '33 × 22 mm', larguraMm: 33, alturaMm: 22, colunas: 1, gapMm: 0 },
  { id: '40x25', label: '40 × 25 mm', larguraMm: 40, alturaMm: 25, colunas: 1, gapMm: 0 },
  { id: '50x30', label: '50 × 30 mm', larguraMm: 50, alturaMm: 30, colunas: 1, gapMm: 0 },
  { id: '60x40', label: '60 × 40 mm', larguraMm: 60, alturaMm: 40, colunas: 1, gapMm: 0 },
];

/** A TLP 2844 e a maioria das Zebra de mesa são 203 dpi = 8 pontos por mm. */
export const DPI_PADRAO = 203;
export const mmParaPontos = (mm: number, dpi = DPI_PADRAO) => Math.round((mm * dpi) / 25.4);

/** Largura total da fita ocupada por uma fileira de etiquetas. */
export function larguraFitaMm(f: FormatoEtiqueta): number {
  return f.colunas * f.larguraMm + (f.colunas - 1) * f.gapMm;
}

export interface ItemEtiqueta {
  nome: string;
  barcode: string;
  copias: number;
}

/**
 * Fila passada de uma tela para outra (a entrada de nota manda os produtos
 * recém-cadastrados para as etiquetas). Vai pelo armazenamento local porque
 * a navegação é por hash e não carrega estado entre telas.
 */
export const FILA_ETIQUETAS = 'catalogo.etiquetas.fila';

export function enviarParaEtiquetas(itens: ItemEtiqueta[]): void {
  localStorage.setItem(FILA_ETIQUETAS, JSON.stringify(itens));
}

export interface OpcoesZpl {
  formato: FormatoEtiqueta;
  dpi?: number;
  /** Escurecimento (~10 a 30). Etiqueta clara demais o leitor não pega. */
  darkness?: number;
  mostrarNome?: boolean;
}

/** Tira acento e caractere que a fonte padrão da Zebra não imprime. */
function limpaTexto(txt: string): string {
  return txt
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[\^~]/g, '-') // ^ e ~ são caracteres de comando do ZPL
    .trim();
}

/**
 * Largura do módulo, em pontos.
 *
 * O EAN-13 gasta 113 módulos com as zonas de silêncio (95 do código + 11 à
 * esquerda + 7 à direita). Em 30 mm a 203 dpi só cabe módulo de 2 pontos —
 * 3 pontos passariam de 42 mm e o código sairia cortado, que é o erro
 * clássico de etiqueta pequena.
 */
export function moduloParaLargura(larguraMm: number, dpi = DPI_PADRAO): number {
  const disponivel = mmParaPontos(larguraMm - 1, dpi); // 0,5 mm de folga de cada lado
  const modulo = Math.floor(disponivel / 113);
  return Math.max(1, Math.min(4, modulo));
}

/** Uma etiqueta desenhada numa posição horizontal da fileira. */
function blocoEtiqueta(item: ItemEtiqueta, o: OpcoesZpl, dpi: number, xPt: number): string[] {
  const larguraPt = mmParaPontos(o.formato.larguraMm, dpi);
  const alturaPt = mmParaPontos(o.formato.alturaMm, dpi);
  const margem = Math.max(2, Math.round(dpi / 25.4)); // ~1 mm

  const modulo = moduloParaLargura(o.formato.larguraMm, dpi);
  const mostrarNome = o.mostrarNome ?? false;
  const alturaNome = mostrarNome ? Math.round(alturaPt * 0.16) : 0;

  // a linha de números embaixo do código come ~1,5 mm
  const alturaNumeros = Math.round(dpi / 17);
  const alturaBarras = Math.max(
    24,
    alturaPt - alturaNome - alturaNumeros - margem * 2,
  );

  const linhas: string[] = [];
  if (mostrarNome) {
    const nome = limpaTexto(item.nome).slice(0, 28);
    linhas.push(
      `^FO${xPt},${margem}^A0N,${alturaNome},${alturaNome}^FB${larguraPt},1,0,C^FD${nome}^FS`,
    );
  }
  linhas.push(
    `^FO${xPt},${margem + alturaNome}^BY${modulo}`,
    `^FB${larguraPt},1,0,C`,
    `^BEN,${alturaBarras},Y,N`,
    `^FD${item.barcode.slice(0, 12)}^FS`,
  );
  return linhas;
}

/** Expande as cópias numa lista simples: cada etiqueta vira um elemento. */
function expandir(itens: ItemEtiqueta[]): ItemEtiqueta[] {
  const todas: ItemEtiqueta[] = [];
  for (const i of itens) {
    if (!/^\d{13}$/.test(i.barcode)) continue;
    for (let n = 0; n < Math.max(1, i.copias); n++) todas.push({ ...i, copias: 1 });
  }
  return todas;
}

export function gerarZpl(itens: ItemEtiqueta[], o: OpcoesZpl): string {
  const dpi = o.dpi ?? DPI_PADRAO;
  const f = o.formato;
  const passoPt = mmParaPontos(f.larguraMm + f.gapMm, dpi);
  const fitaPt = mmParaPontos(larguraFitaMm(f), dpi);
  const alturaPt = mmParaPontos(f.alturaMm, dpi);

  const todas = expandir(itens);
  const fileiras: string[] = [];

  for (let i = 0; i < todas.length; i += f.colunas) {
    const daFileira = todas.slice(i, i + f.colunas);
    const linhas = [
      '^XA',
      `^PW${fitaPt}`,
      `^LL${alturaPt}`,
      '^LH0,0',
      `^MD${o.darkness ?? 15}`,
      '^CI28', // UTF-8
    ];
    daFileira.forEach((item, col) => linhas.push(...blocoEtiqueta(item, o, dpi, col * passoPt)));
    linhas.push('^XZ');
    fileiras.push(linhas.join('\n'));
  }

  return fileiras.join('\n');
}

/**
 * Etiqueta de calibração: moldura de cada coluna e um código conhecido.
 * A moldura mostra na hora se a largura, o passo entre colunas ou o
 * alinhamento do rolo estão errados — bem mais fácil de diagnosticar do
 * que olhar uma etiqueta torta.
 */
export function gerarZplTeste(o: OpcoesZpl): string {
  const dpi = o.dpi ?? DPI_PADRAO;
  const f = o.formato;
  const passoPt = mmParaPontos(f.larguraMm + f.gapMm, dpi);
  const larguraPt = mmParaPontos(f.larguraMm, dpi);
  const fitaPt = mmParaPontos(larguraFitaMm(f), dpi);
  const alturaPt = mmParaPontos(f.alturaMm, dpi);

  const linhas = ['^XA', `^PW${fitaPt}`, `^LL${alturaPt}`, '^LH0,0', `^MD${o.darkness ?? 15}`, '^CI28'];
  for (let col = 0; col < f.colunas; col++) {
    const x = col * passoPt;
    // moldura de 2 pontos: deve encostar nas bordas da etiqueta física
    linhas.push(`^FO${x},0^GB${larguraPt},${alturaPt},2^FS`);
    linhas.push(`^FO${x + 6},6^A0N,18,18^FD${f.larguraMm}x${f.alturaMm} c${col + 1}^FS`);
  }
  // um EAN-13 real no meio, para conferir a leitura
  const meio = Math.floor(f.colunas / 2) * passoPt;
  linhas.push(
    `^FO${meio},${Math.round(alturaPt * 0.35)}^BY${moduloParaLargura(f.larguraMm, dpi)}`,
    `^FB${larguraPt},1,0,C`,
    `^BEN,${Math.round(alturaPt * 0.4)},Y,N`,
    '^FD789600620774^FS',
    '^XZ',
  );
  return linhas.join('\n');
}

/** Calibração do sensor de mídia no ZPL, equivalente ao AutoSense do EPL. */
export function zplCalibrar(): string {
  return '~JC';
}
