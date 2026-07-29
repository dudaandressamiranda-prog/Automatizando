/**
 * Mapa de categorias (importador/categorias-mapa.csv): traduz os nomes
 * de categoria que vêm da planilha para a taxonomia curada do catálogo
 * ("Medicamentos Shopee" → "Medicamentos" etc.). Comparação ignora
 * acento/caixa. Para ajustar a taxonomia, edite o CSV — uma linha
 * "De;Para" por regra.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { norm } from './normalize.js';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'categorias-mapa.csv');

let cache: Map<string, string> | null = null;

function loadMap(): Map<string, string> {
  if (cache) return cache;
  cache = new Map();
  let text = '';
  try {
    text = readFileSync(FILE, 'utf8');
  } catch {
    return cache; // arquivo é opcional
  }
  for (const line of text.split('\n').slice(1)) {
    const [de, para] = line.split(';');
    if (de?.trim() && para?.trim()) cache.set(norm(de), para.trim());
  }
  return cache;
}

/** Aplica o mapa a um nome de categoria vindo da planilha. */
export function mapCategory(name: string | null): string | null {
  if (!name) return null;
  return loadMap().get(norm(name)) ?? name;
}
