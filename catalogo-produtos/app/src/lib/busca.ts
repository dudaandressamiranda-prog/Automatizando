/**
 * Busca por texto com curinga `%`, do jeito que quem mexe com planilha e
 * banco já espera.
 *
 * "areia%tofu" acha "AREIA BIODEGRADAVEL TOFU CARVÃO 2KG": os pedaços têm
 * que aparecer, nessa ordem, com qualquer coisa no meio. É o mesmo
 * significado do LIKE do SQL, então quem usa `%` acerta de primeira.
 *
 * Sem `%` nada muda: continua sendo "contém este texto".
 */
import { norm } from './normalize';

/**
 * Monta o teste de uma busca. Devolve null quando não há o que buscar,
 * para a tela saber que deve mostrar a listagem normal em vez de
 * "nenhum resultado".
 */
export function criarBusca(q: string): ((texto: string) => boolean) | null {
  const termo = norm(q);
  if (!termo) return null;

  // "%areia%%tofu%" → ["areia", "tofu"]: % nas pontas e repetido não muda nada
  const partes = termo.split('%').map((p) => p.trim()).filter(Boolean);
  if (partes.length === 0) return null; // só "%" digitado: não filtra nada

  if (partes.length === 1) {
    const unico = partes[0]!;
    return (texto) => norm(texto).includes(unico);
  }

  return (texto) => {
    const alvo = norm(texto);
    let de = 0;
    for (const parte of partes) {
      const achou = alvo.indexOf(parte, de);
      if (achou < 0) return false;
      de = achou + parte.length; // o próximo pedaço tem que vir DEPOIS deste
    }
    return true;
  };
}
