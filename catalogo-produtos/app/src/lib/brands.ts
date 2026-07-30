import { norm } from './normalize';
import type { ListProduct } from './types';

/**
 * Filtros de marca por grupo de categoria. Só listas curadas — nada de
 * marca aleatória: cada entrada é um rótulo e os termos que o identificam
 * no nome/marca do produto. Começando por Medicamentos e Rações/Petiscos
 * (fase de teste); dá para estender às demais categorias depois.
 */
interface Marca {
  label: string;
  termos: string[]; // casam por "contém", já normalizados na comparação
}

const MEDICAMENTOS: Marca[] = [
  { label: 'Avert', termos: ['avert'] },
  { label: 'Zoetis', termos: ['zoetis'] },
  { label: 'Vetnil', termos: ['vetnil'] },
  { label: 'Virbac', termos: ['virbac'] },
  { label: 'Ourofino', termos: ['ourofino', 'ouro fino'] },
  { label: 'Ceva', termos: ['ceva'] },
  { label: 'Agener', termos: ['agener'] },
  { label: 'Coveli', termos: ['coveli'] },
  { label: 'MSD', termos: ['msd', 'nexgard', 'bravecto'] },
  { label: 'Elanco', termos: ['elanco', 'advocate', 'seresto'] },
  { label: 'Konig', termos: ['konig'] },
  { label: 'Biovet', termos: ['biovet'] },
];

const RACAO: Marca[] = [
  { label: 'Premier', termos: ['premier'] },
  { label: 'Golden', termos: ['golden'] },
  { label: 'Royal Canin', termos: ['royal canin', 'royalcanin'] },
  { label: 'Farmina N&D', termos: ['farmina', 'n&d', 'n & d'] },
  { label: 'Vet Life', termos: ['vet life', 'vetlife'] },
  { label: 'Fórmula Natural', termos: ['formula natural'] },
  { label: 'Whiskas', termos: ['whiskas'] },
  { label: 'Pedigree', termos: ['pedigree'] },
  { label: 'GranPlus', termos: ['granplus', 'gran plus'] },
  { label: 'Magnus', termos: ['magnus'] },
  { label: 'Guabi', termos: ['guabi', 'guabitos'] },
  { label: 'Purina', termos: ['purina', 'friskies', 'gourmet', 'fancy feast'] },
  { label: 'Hills', termos: ["hill's", 'hills'] },
  { label: 'Biofresh', termos: ['biofresh'] },
];

/** Marcas candidatas para um grupo de categoria (1º nível). */
export function brandsForGroup(group: string): Marca[] {
  if (group === 'Medicamentos') return MEDICAMENTOS;
  if (group.startsWith('Ração')) return RACAO;
  return [];
}

const campo = (p: ListProduct) => norm(`${p.name} ${p.brand ?? ''}`);

/** Uma marca casa com o produto? */
export function productHasBrand(p: ListProduct, marca: Marca): boolean {
  const s = campo(p);
  return marca.termos.some((t) => s.includes(norm(t)));
}

/** Só as marcas que de fato têm produtos na lista (evita chip vazio). */
export function availableBrands(products: ListProduct[], group: string): Marca[] {
  const candidatas = brandsForGroup(group);
  return candidatas.filter((m) => products.some((p) => productHasBrand(p, m)));
}
