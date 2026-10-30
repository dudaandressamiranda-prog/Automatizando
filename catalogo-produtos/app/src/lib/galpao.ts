import { useState } from 'react';

const CHAVE = 'catalogo.filtro.soGalpao';

/**
 * Filtro "Só Galpão", compartilhado entre o Início e as categorias: ligado
 * na busca, continua ligado ao entrar numa categoria (e vice-versa), para
 * dar para combinar com categoria, subcategoria, marca e busca. Vale até
 * fechar a aba.
 */
export function useSoGalpao(): [boolean, (v: boolean) => void] {
  const [ligado, setLigado] = useState(() => {
    try {
      return sessionStorage.getItem(CHAVE) === '1';
    } catch {
      return false;
    }
  });
  function definir(v: boolean) {
    setLigado(v);
    try {
      if (v) sessionStorage.setItem(CHAVE, '1');
      else sessionStorage.removeItem(CHAVE);
    } catch {
      /* sem armazenamento: o filtro só não sobrevive à troca de tela */
    }
  }
  return [ligado, definir];
}
