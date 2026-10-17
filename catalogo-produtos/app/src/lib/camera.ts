/** Mensagem amigável para os erros mais comuns de getUserMedia. */
export function mensagemErroCamera(e: unknown): string {
  const nome = e instanceof DOMException ? e.name : '';
  if (nome === 'NotAllowedError' || nome === 'SecurityError') return 'Permita o acesso à câmera para continuar.';
  if (nome === 'NotFoundError' || nome === 'OverconstrainedError') return 'Nenhuma câmera encontrada neste aparelho.';
  if (nome === 'NotReadableError') return 'A câmera está sendo usada por outro app. Feche-o e tente de novo.';
  return e instanceof Error ? e.message : 'Não foi possível abrir a câmera.';
}

export const vibrar = (p: number | number[]) => navigator.vibrate?.(p);
