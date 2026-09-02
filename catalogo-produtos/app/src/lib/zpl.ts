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

/**
 * Modelos de etiqueta em uso na loja, em milímetros.
 *
 * Medir o rolo antes de escolher não é preciosismo: quando o tamanho
 * declarado é menor que o real, cada etiqueta impressa fica um pouco atrás
 * da física, o erro se acumula e em poucas linhas o conteúdo passa a cair
 * em cima do picote. O sintoma parece falta de calibração, mas nenhuma
 * calibração conserta — o que está errado é a medida.
 */
export interface FormatoEtiqueta {
  id: string;
  label: string;
  larguraMm: number;
  alturaMm: number;
  /** Etiquetas lado a lado na fita. */
  colunas: number;
  /** Espaço entre uma coluna e a seguinte. */
  gapMm: number;
  /**
   * Altura das barras já testada e impressa com sucesso nesta etiqueta —
   * quando presente, vale no lugar da fração calculada automaticamente
   * (veja `blocoEtiqueta`). Só faz sentido guardar aqui um valor que já
   * saiu alinhado e dentro dos limites físicos da etiqueta.
   */
  alturaCodigoMm?: number;
}

export const FORMATOS: FormatoEtiqueta[] = [
  {
    id: '33x21x3',
    label: '33 × 21 mm — 3 colunas (ZD230)',
    larguraMm: 33,
    alturaMm: 21,
    colunas: 3,
    gapMm: 3,
    alturaCodigoMm: 15,
  },
  { id: '33x22x3', label: '33 × 22 mm — 3 colunas', larguraMm: 33, alturaMm: 22, colunas: 3, gapMm: 3 },
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
  /**
   * Com ribbon (transferência térmica) ou sem (térmica direta).
   *
   * Errar aqui gasta um rolo sem imprimir nada: a impressora configurada
   * para térmica direta não aquece o ribbon, e a etiqueta sai em branco.
   * Como vai no comando, o ajuste acompanha o trabalho e não depende de
   * ninguém ter configurado a impressora antes.
   */
  ribbon?: boolean;
}

/**
 * Cabeçalho comum: tamanho, escurecimento e tipo de mídia.
 *
 * ^MT diz se tem ribbon; ^MNY manda usar o sensor de vão, que é o certo
 * para etiqueta picotada em rolo. Sem esses dois, vale o que estiver
 * guardado na impressora — e aí a mesma etiqueta sai diferente em cada
 * máquina, que é exatamente o tipo de surpresa difícil de diagnosticar.
 */
function cabecalho(o: OpcoesZpl, fitaPt: number, alturaPt: number): string[] {
  return [
    '^XA',
    `^PW${fitaPt}`,
    `^LL${alturaPt}`,
    '^LH0,0',
    `^MD${o.darkness ?? 15}`,
    `^MT${o.ribbon ?? true ? 'T' : 'D'}`,
    '^MNY', // sensor de vão entre etiquetas
    '^CI28', // UTF-8
  ];
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

  /*
   * Altura das barras: uma FRAÇÃO do que sobra, não todo o resto.
   *
   * Usar todo o espaço restante deixava a etiqueta com 21,6 mm de conteúdo
   * numa etiqueta de 22 mm — matematicamente cabe, na prática não: a
   * legenda numérica ocupa mais do que a conta reservava, e sem margem
   * embaixo qualquer desvio de registro joga o código para fora do papel.
   * Com 70% as barras seguem altas o bastante para o leitor e sobra folga
   * visível nas duas pontas.
   */
  const util = alturaPt - alturaNome - margem * 2;
  const alturaBarras = o.formato.alturaCodigoMm
    ? mmParaPontos(o.formato.alturaCodigoMm, dpi)
    : Math.max(20, Math.round(util * 0.7));

  const linhas: string[] = [];
  if (mostrarNome) {
    const nome = limpaTexto(item.nome).slice(0, 28);
    linhas.push(
      `^FO${xPt},${margem}^A0N,${alturaNome},${alturaNome}^FB${larguraPt},1,0,C^FD${nome}^FS`,
    );
  }
  // Centralização na mão, e não com ^FB: aquele comando é de bloco de
  // TEXTO. Aplicado a código de barras ele não centraliza — desloca o
  // campo, e o código sai numa etiqueta ao lado, por cima do nome.
  const larguraCodigo = 95 * modulo;
  const xCodigo = xPt + Math.max(0, Math.round((larguraPt - larguraCodigo) / 2));
  linhas.push(
    `^FO${xCodigo},${margem + alturaNome}^BY${modulo}`,
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
    const linhas = cabecalho(o, fitaPt, alturaPt);
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

  const linhas = cabecalho(o, fitaPt, alturaPt);
  for (let col = 0; col < f.colunas; col++) {
    const x = col * passoPt;
    // Moldura recuada 2 pontos: encostada na borda ela cai exatamente no
    // picote e some, e aí não dá para saber se acertou o tamanho ou se
    // simplesmente não imprimiu.
    linhas.push(`^FO${x + 2},2^GB${larguraPt - 4},${alturaPt - 4},2^FS`);
    linhas.push(`^FO${x + 6},6^A0N,18,18^FD${f.larguraMm}x${f.alturaMm} c${col + 1}^FS`);
  }
  // um EAN-13 real no meio, para conferir a leitura
  const modulo = moduloParaLargura(f.larguraMm, dpi);
  const meio = Math.floor(f.colunas / 2) * passoPt;
  const xCodigo = meio + Math.max(0, Math.round((larguraPt - 95 * modulo) / 2));
  linhas.push(
    `^FO${xCodigo},${Math.round(alturaPt * 0.35)}^BY${modulo}`,
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
