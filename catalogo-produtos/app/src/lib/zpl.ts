/**
 * Gera ZPL — a linguagem que as impressoras Zebra entendem — para etiquetas
 * de código de barras.
 *
 * O código de barras é desenhado pela própria impressora (comando ^BE), não
 * enviado como imagem: sai muito mais nítido e legível ao leitor, que é o
 * que importa numa etiqueta de gôndola.
 */

/** Modelos de etiqueta em uso na loja, em milímetros. */
export interface FormatoEtiqueta {
  id: string;
  label: string;
  larguraMm: number;
  alturaMm: number;
  /** Etiquetas lado a lado na mesma fita (2 = fita dupla). */
  colunas: number;
}

export const FORMATOS: FormatoEtiqueta[] = [
  { id: '33x22', label: '33 × 22 mm (gôndola)', larguraMm: 33, alturaMm: 22, colunas: 1 },
  { id: '50x25', label: '50 × 25 mm', larguraMm: 50, alturaMm: 25, colunas: 1 },
  { id: '60x40', label: '60 × 40 mm', larguraMm: 60, alturaMm: 40, colunas: 1 },
  { id: '33x22d', label: '33 × 22 mm — fita dupla', larguraMm: 33, alturaMm: 22, colunas: 2 },
];

/** Zebra de mesa costuma ser 203 dpi = 8 pontos por milímetro. */
export const DPI_PADRAO = 203;
const mmParaPontos = (mm: number, dpi: number) => Math.round((mm * dpi) / 25.4);

export interface ItemEtiqueta {
  nome: string;
  barcode: string;
  copias: number;
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
    .replace(/\^|~/g, '-') // ^ e ~ são caracteres de comando do ZPL
    .trim();
}

/**
 * Uma etiqueta. O ^BY define a largura do módulo; ^BEN desenha o EAN-13 a
 * partir de 12 dígitos — a impressora calcula o verificador sozinha.
 */
function etiqueta(item: ItemEtiqueta, o: OpcoesZpl, dpi: number): string {
  const larguraPt = mmParaPontos(o.formato.larguraMm, dpi);
  const alturaPt = mmParaPontos(o.formato.alturaMm, dpi);
  const margem = Math.round(dpi / 25.4); // 1 mm

  const nome = limpaTexto(item.nome).slice(0, 32);
  const mostrarNome = o.mostrarNome ?? true;
  const alturaNome = mostrarNome ? Math.round(alturaPt * 0.18) : 0;

  // sobra para o código de barras depois do nome e das margens
  const alturaBarras = Math.max(30, alturaPt - alturaNome - margem * 2 - Math.round(dpi / 6));
  // módulo estreito: 2 pontos em 203 dpi dá EAN-13 legível em 33 mm
  const modulo = larguraPt >= mmParaPontos(45, dpi) ? 3 : 2;

  const linhas = [
    '^XA',
    `^PW${larguraPt}`,
    `^LL${alturaPt}`,
    '^LH0,0',
    `^MD${o.darkness ?? 15}`,
    '^CI28', // UTF-8
  ];

  if (mostrarNome) {
    linhas.push(`^FO${margem},${margem}^A0N,${alturaNome},${alturaNome}^FB${larguraPt - margem * 2},1,0,C^FD${nome}^FS`);
  }

  linhas.push(
    `^FO0,${margem + alturaNome}^BY${modulo}`,
    `^FB${larguraPt},1,0,C`,
    `^BEN,${alturaBarras},Y,N`,
    `^FD${item.barcode.slice(0, 12)}^FS`,
    `^PQ${Math.max(1, item.copias)}`,
    '^XZ',
  );
  return linhas.join('\n');
}

export function gerarZpl(itens: ItemEtiqueta[], o: OpcoesZpl): string {
  const dpi = o.dpi ?? DPI_PADRAO;
  return itens
    .filter((i) => /^\d{13}$/.test(i.barcode))
    .map((i) => etiqueta(i, o, dpi))
    .join('\n');
}
