/**
 * Emoji por categoria de topo — usado no menu lateral e nos cards da tela
 * inicial. Categoria sem entrada aqui cai no FALLBACK (🐾), não numa
 * caixa genérica. Toda vez que uma categoria nova é criada, adicione uma
 * linha aqui com um ícone que combine com ela.
 */
export const CATEGORY_ICON: Record<string, string> = {
  'Ração para Cães': '🦴',
  'Ração para Gatos': '🐱',
  'Ração para Peixes': '🐠',
  'Ração para Roedores': '🐹',
  'Ração para Répteis': '🦎',
  Medicamentos: '💊',
  'Higiene e Limpeza': '🧴',
  Brinquedos: '🧸',
  Acessórios: '🎽',
  Armarinho: '🎀',
  Sementes: '🌱',
  'Coleiras e Guias': '🦮',
  'Camas e Casinhas': '🛏️',
  'Animais Silvestres': '🦔',
  'Comedouros e Bebedouros': '🥣',
};

export const FALLBACK_ICON = '🐾';

export function iconFor(group: string): string {
  return CATEGORY_ICON[group] ?? FALLBACK_ICON;
}
