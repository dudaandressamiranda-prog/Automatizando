import { useEffect, useState } from 'react';
import type { NewItem } from './cart';

/**
 * Seleção "em aberto" dentro de uma categoria: os itens que a pessoa
 * marcou mas ainda não salvou no carrinho. Fica num módulo (não no
 * componente da categoria) para sobreviver ao desmonte — assim, ao sair
 * da categoria, o app consegue perguntar se quer salvar antes de perder.
 */
export interface Pending {
  categoria: string;
  items: NewItem[];
}

let current: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function setPending(p: Pending | null) {
  current = p && p.items.length > 0 ? p : null;
  emit();
}
export function getPending(): Pending | null {
  return current;
}

export function usePending(): Pending | null {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return current;
}
