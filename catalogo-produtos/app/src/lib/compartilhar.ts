/**
 * Compartilhar o endereço do app.
 *
 * No celular abre a folha do próprio sistema — WhatsApp, e-mail, o que a
 * pessoa usa. No computador, onde essa folha quase nunca existe, copia o
 * link para a área de transferência, que dá no mesmo com um passo a mais.
 */

export type ResultadoCompartilhar = 'compartilhado' | 'copiado' | 'cancelado' | 'falhou';

/** O endereço de onde o app está servido, sem rota nem busca pendurada. */
export function enderecoDoApp(): string {
  return `${window.location.origin}/`;
}

export async function compartilharApp(titulo: string): Promise<ResultadoCompartilhar> {
  const url = enderecoDoApp();

  if (navigator.share) {
    try {
      // `url` separado do texto: o WhatsApp e o Telegram montam a prévia do
      // link a partir dele, e link colado dentro do texto não vira prévia.
      await navigator.share({ title: titulo, text: `${titulo} — catálogo da loja`, url });
      return 'compartilhado';
    } catch (e) {
      // fechar a folha de compartilhamento não é erro, e não deve virar aviso
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelado';
      // qualquer outra falha ainda tem a cópia como saída
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return 'copiado';
  } catch {
    return 'falhou';
  }
}
