/**
 * Rastro do último produto mexido.
 *
 * Depois de salvar, a pessoa volta para a lista da categoria — mas a lista
 * é longa e recarrega do zero, então ela reaparece no topo sem saber onde
 * parou. Guardando o id aqui, a lista rola até o produto e o destaca por
 * um instante: dá para continuar de onde estava.
 *
 * Vai por sessionStorage porque a navegação é por hash e não carrega estado
 * entre telas, e porque isso não deve sobreviver ao fechamento da aba.
 */
export const PRODUTO_RECENTE = 'catalogo.produto.recente';

/** Só lê. Apagar fica para depois de a lista realmente ter rolado até ele. */
export function lerProdutoRecente(): string | null {
  return sessionStorage.getItem(PRODUTO_RECENTE);
}

/** O destaque é de uma vez só: some assim que cumpre o papel. */
export function limparProdutoRecente(): void {
  sessionStorage.removeItem(PRODUTO_RECENTE);
}
