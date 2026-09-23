/**
 * Agrupamento por dia, para listas de reposição.
 *
 * Uma lista é o registro de um dia de trabalho. Misturar a de segunda com a
 * de quinta faz perder a única referência que quem separa tem — "a lista de
 * ontem" — então tudo o que é histórico aparece debaixo da data em que
 * nasceu, nunca solto.
 */

/** Chave estável do dia (aaaa-mm-dd no fuso de quem está olhando). */
export function chaveDoDia(iso: string): string {
  const d = new Date(iso);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Rótulo do dia em português. "Hoje" e "Ontem" por extenso porque é assim
 * que as pessoas falam da lista, e a data só aparece quando faz falta.
 */
export function rotuloDoDia(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const meiaNoite = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((meiaNoite(hoje) - meiaNoite(d)) / 86_400_000);
  if (dias === 0) return 'Hoje';
  if (dias === 1) return 'Ontem';
  if (dias < 7) {
    const semana = d.toLocaleDateString('pt-BR', { weekday: 'long' });
    return `${semana.charAt(0).toUpperCase()}${semana.slice(1)}, ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Agrupa por dia de criação, do mais recente para o mais antigo. */
export function porDia<T extends { created_at: string }>(itens: T[]): { dia: string; rotulo: string; itens: T[] }[] {
  const mapa = new Map<string, T[]>();
  for (const i of itens) {
    const k = chaveDoDia(i.created_at);
    const lista = mapa.get(k);
    if (lista) lista.push(i);
    else mapa.set(k, [i]);
  }
  return [...mapa.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dia, lista]) => ({ dia, rotulo: rotuloDoDia(lista[0]!.created_at), itens: lista }));
}
