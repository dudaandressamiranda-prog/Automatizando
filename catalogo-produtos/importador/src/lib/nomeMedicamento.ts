/**
 * Nome do medicamento sem o tipo/classe na frente, para ordenar a
 * prateleira pelo nome de verdade — "Anti-inflamatório Flamavet..." vira
 * "Flamavet..." na hora de ordenar, sem alterar o nome original.
 *
 * REGRA DE OURO: só corta uma classe genérica CONHECIDA do começo do nome,
 * uma vez só (sem encadear), e nunca risco de sobrar vazio — se o corte
 * deixasse menos de 2 caracteres, o nome original volta inteiro. O
 * "Produto" da planilha nunca é tocado; isto só gera uma segunda coluna
 * para servir de chave de ordenação.
 *
 * Corta por acaso o começo de uma marca de verdade? Cada palavra da lista
 * foi conferida contra as 773 linhas reais do catálogo antes de entrar
 * aqui — ver `npm run medicamentos-xls -- --conferir` para revisar de novo
 * se o catálogo mudar.
 */

/** Tira acento de UM caractere, mantendo a mesma posição — nunca junta ou
 * separa caracteres, então o texto resultante tem o mesmo tamanho do
 * original e dá para cortar o original na mesma posição do corte feito
 * aqui. */
function semAcentoMesmoTamanho(txt: string): string {
  return txt
    .split('')
    .map((c) => (c.normalize('NFD').replace(/[̀-ͯ]/g, '')[0] ?? c).toLowerCase())
    .join('');
}

/**
 * Frases compostas primeiro (mais específicas), palavras soltas depois
 * como reserva. `\s+` aceita variação de espaço; hífen opcional em
 * "anti-x" aceita "anti x", "antix" e "anti-x".
 */
const PADROES: RegExp[] = [
  // compostos
  /^suplemento\s+alimentar\s*/i,
  /^suplemento\s+vitaminico[\s-]+aminoacido\s*/i,
  /^suplemento\s+vitaminico\s*/i,
  /^suplemento\s+mineral\s*/i,
  /^suplemento\s+proteico\s*/i,
  /^pomada\s+cicatrizante\s*/i,
  /^pomada\s+oftalmologica\s*/i,
  /^pomada\s+otologica\s*/i,
  /^solucao\s+de\s+limpeza\s*/i,
  /^solucao\s+oral\s*/i,
  /^solucao\s+otologica\s*/i,
  /^xarope\s+expectorante\s*/i,
  /^espuma\s+bucal\s*/i,
  /^gel\s+otologico\s*/i,
  /^anti[-\s]?hipertensivo\s*/i,
  /^antipulgas\s+e\s+carrapatos\s*/i,

  // simples, como reserva
  /^anti[-\s]?inflamatori[oa]\s*/i, // aceita "anti-inflamatorio", "anti inflamatorio" e "antiinflamatorio"
  /^antibiotico\s*/i,
  /^antibacteriano\s*/i,
  /^antiemetico\s*/i,
  /^antifungico\s*/i,
  /^antimicotico\s*/i,
  /^antimicrobiano\s*/i,
  /^antioxidante\s*/i,
  /^antiparasitario\s*/i,
  /^antipulgas\s*/i,
  /^antisseptico\s*/i,
  /^antiseptico\s*/i,
  /^antialergico\s*/i,
  /^antitermico\s*/i,
  /^antifebril\s*/i,
  /^analgesico\s*/i,
  /^anestesico\s*/i,
  /^broncodilatador\s*/i,
  /^corticoide\s*/i,
  /^colirio\s*/i,
  /^desinfetante\s*/i,
  /^diuretico\s*/i,
  /^fluido\s*/i,
  /^hepatoprotetor\s*/i,
  /^hidratante\s*/i,
  /^laxante\s*/i,
  /^mucolitico\s*/i,
  /^probiotico\s*/i,
  /^p[oó]\s+/i, // "Pó" — exige espaço depois para não pegar "Pomada", "Potinho" etc.
  /^pomada\s*/i,
  /^repelente\s*/i,
  /^sedativo\s*/i,
  /^solucao\s*/i,
  /^suplemento\s*/i,
  /^talco\s*/i,
  /^tranquilizante\s*/i,
  /^vacina\s*/i,
  /^vermifugo\s*/i,
  /^coleira\s*/i,
];

/** Filler que só faz sentido colado bem atrás do tipo — nunca é começo de marca. */
const FILLER_LOGO_DEPOIS = /^(para\s+(c[aã]es(\s+e\s+gatos)?|gatos?)|p\/\s*(c[aã]es|gatos))\b[\s.,-]*/i;

export interface NomeLimpo {
  /** O que vai na chave de ordenação — nunca vazio. */
  nome: string;
  /** O que foi cortado da frente, para conferência — vazio se nada mudou. */
  removido: string;
}

export function nomeParaOrdenar(original: string): NomeLimpo {
  const chave = semAcentoMesmoTamanho(original);

  for (const padrao of PADROES) {
    const m = padrao.exec(chave);
    if (!m) continue;

    let fim = m[0].length;
    // o filler "para Cães/Gatos" logo atrás do tipo também não é nome de marca
    const resto = chave.slice(fim);
    const mFiller = FILLER_LOGO_DEPOIS.exec(resto);
    if (mFiller) fim += mFiller[0].length;

    const cortado = original.slice(0, fim);
    const restante = original.slice(fim).replace(/^[\s.,;:-]+/, '');

    // rede de segurança: nunca deixa a chave de ordenação vazia ou irrisória
    if (restante.length < 2) return { nome: original, removido: '' };
    return { nome: restante, removido: cortado.trim() };
  }

  return { nome: original, removido: '' };
}
