/**
 * Gera EPL2 — a linguagem das Zebra da linha Eltron, como a TLP 2844.
 *
 * Nem toda Zebra fala ZPL. A TLP 2844 e as irmãs (LP 2844, TLP 2824) vêm
 * de fábrica com firmware EPL, e mandar ZPL para elas não dá erro
 * silencioso: o trabalho morre na fila do Windows com "Erro", que é
 * exatamente o sintoma difícil de diagnosticar. O Zebra Setup Utilities
 * denuncia a linguagem no título da janela — "[EPL]" ou "[ZPL]".
 *
 * Como no ZPL, o código de barras é desenhado pela impressora (comando B),
 * não mandado como imagem: sai nítido e o leitor pega de primeira.
 */
import type { FormatoEtiqueta, ItemEtiqueta } from './zpl';
import { larguraFitaMm, mmParaPontos, moduloParaLargura } from './zpl';

export interface OpcoesEpl {
  formato: FormatoEtiqueta;
  dpi?: number;
  /** Densidade de 0 a 15 no EPL (o ZPL usa 0 a 30). */
  densidade?: number;
  /** Velocidade: 1 a 4 na TLP 2844. Mais devagar = barra mais definida. */
  velocidade?: number;
  mostrarNome?: boolean;
  /** Vão vertical entre as fileiras de etiquetas, em mm. */
  gapVerticalMm?: number;
}

/** EPL não tem escape: aspas e barra invertida precisam ser neutralizadas. */
function limpaTexto(txt: string): string {
  return txt
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/["\\]/g, "'")
    .trim();
}

/**
 * Comandos de uma etiqueta numa posição horizontal da fileira.
 *
 * B x,y,rot,tipo,estreita,larga,altura,legivel,"dados"
 *   E30 = EAN-13. Mandamos 12 dígitos e a impressora calcula o 13º.
 * A x,y,rot,fonte,mult-h,mult-v,reverso,"texto"
 */
function blocoEtiqueta(item: ItemEtiqueta, o: OpcoesEpl, dpi: number, xPt: number): string[] {
  const larguraPt = mmParaPontos(o.formato.larguraMm, dpi);
  const alturaPt = mmParaPontos(o.formato.alturaMm, dpi);
  const margem = Math.max(2, Math.round(dpi / 25.4));

  const estreita = moduloParaLargura(o.formato.larguraMm, dpi);
  const larga = estreita * 2;
  const mostrarNome = o.mostrarNome ?? false;
  const alturaNome = mostrarNome ? 20 : 0;

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
  const alturaBarras = Math.max(20, Math.round(util * 0.7));

  // o EAN-13 gasta 95 módulos; centraliza o que sobra na etiqueta
  const larguraCodigo = 95 * estreita;
  const xCodigo = xPt + Math.max(0, Math.round((larguraPt - larguraCodigo) / 2));

  const linhas: string[] = [];
  if (mostrarNome) {
    const nome = limpaTexto(item.nome).slice(0, 24);
    linhas.push(`A${xPt + margem},${margem},0,2,1,1,N,"${nome}"`);
  }
  linhas.push(
    `B${xCodigo},${margem + alturaNome},0,E30,${estreita},${larga},${alturaBarras},B,"${item.barcode.slice(0, 12)}"`,
  );
  return linhas;
}

/** Expande as cópias: cada etiqueta vira um elemento da lista. */
function expandir(itens: ItemEtiqueta[]): ItemEtiqueta[] {
  const todas: ItemEtiqueta[] = [];
  for (const i of itens) {
    if (!/^\d{13}$/.test(i.barcode)) continue;
    for (let n = 0; n < Math.max(1, i.copias); n++) todas.push({ ...i, copias: 1 });
  }
  return todas;
}

/** Cabeçalho comum: limpa o buffer e declara o tamanho da mídia. */
function cabecalho(o: OpcoesEpl, dpi: number): string[] {
  const f = o.formato;
  const fitaPt = mmParaPontos(larguraFitaMm(f), dpi);
  const alturaPt = mmParaPontos(f.alturaMm, dpi);
  const gapPt = mmParaPontos(o.gapVerticalMm ?? 3, dpi);
  return [
    'N', // limpa o buffer da imagem
    `q${fitaPt}`, // largura da fita, em pontos
    `Q${alturaPt},${gapPt}`, // altura da etiqueta e vão entre elas
    `S${o.velocidade ?? 2}`,
    `D${Math.min(15, Math.max(0, o.densidade ?? 10))}`,
    'JF', // liga o alimentador automático (back-feed)
  ];
}

export function gerarEpl(itens: ItemEtiqueta[], o: OpcoesEpl): string {
  const dpi = o.dpi ?? 203;
  const f = o.formato;
  const passoPt = mmParaPontos(f.larguraMm + f.gapMm, dpi);

  const todas = expandir(itens);
  const fileiras: string[] = [];

  for (let i = 0; i < todas.length; i += f.colunas) {
    const daFileira = todas.slice(i, i + f.colunas);
    const linhas = cabecalho(o, dpi);
    daFileira.forEach((item, col) => linhas.push(...blocoEtiqueta(item, o, dpi, col * passoPt)));
    linhas.push('P1'); // imprime uma fileira
    fileiras.push(linhas.join('\n'));
  }

  return fileiras.join('\n');
}

/**
 * Etiqueta de calibração: moldura de cada coluna e um EAN conhecido. A
 * moldura mostra na hora se largura, passo entre colunas ou alinhamento do
 * rolo estão errados.
 *
 * X x1,y1,espessura,x2,y2 desenha o retângulo.
 */
export function gerarEplTeste(o: OpcoesEpl): string {
  const dpi = o.dpi ?? 203;
  const f = o.formato;
  const passoPt = mmParaPontos(f.larguraMm + f.gapMm, dpi);
  const larguraPt = mmParaPontos(f.larguraMm, dpi);
  const alturaPt = mmParaPontos(f.alturaMm, dpi);
  const estreita = moduloParaLargura(f.larguraMm, dpi);

  const linhas = cabecalho(o, dpi);
  for (let col = 0; col < f.colunas; col++) {
    const x = col * passoPt;
    linhas.push(`X${x},0,2,${x + larguraPt - 1},${alturaPt - 1}`);
    linhas.push(`A${x + 6},6,0,1,1,1,N,"${f.larguraMm}x${f.alturaMm} c${col + 1}"`);
  }
  const meio = Math.floor(f.colunas / 2) * passoPt;
  const larguraCodigo = 95 * estreita;
  const xCodigo = meio + Math.max(0, Math.round((larguraPt - larguraCodigo) / 2));
  linhas.push(
    `B${xCodigo},${Math.round(alturaPt * 0.3)},0,E30,${estreita},${estreita * 2},${Math.round(alturaPt * 0.4)},B,"789600620774"`,
  );
  linhas.push('P1');
  return linhas.join('\n');
}

/**
 * Manda a impressora medir sozinha o vão entre as etiquetas (AutoSense).
 *
 * Sem isso ela não sabe onde uma etiqueta termina e a outra começa, e a
 * impressão sai deslocada ou avançando etiqueta a mais. É o mesmo que o
 * truque de ligar segurando o botão de avanço, só que por comando.
 */
export function eplCalibrar(): string {
  return 'xa';
}
