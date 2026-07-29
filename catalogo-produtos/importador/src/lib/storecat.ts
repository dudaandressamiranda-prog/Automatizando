/**
 * Traduz o caminho de categoria das lojas (APIs VTEX, ex.:
 * "/Cachorros/Rações/Ração Seca/") para a taxonomia do catálogo.
 *
 * É a segunda evidência da classificação: quando o nome do produto não diz
 * nada ("Comedouro Pet Ice Cream"), a categoria que a loja usa para aquele
 * mesmo código de barras costuma resolver.
 */
import { norm } from './normalize.js';

export function classifyByStorePath(path: string): string | null {
  const p = norm(path);
  const gato = p.includes('/gato');
  const tem = (rx: RegExp) => rx.test(p);
  const porEspecie = (g: string, c: string) => (gato ? g : c);

  if (tem(/racao|alimento umido|sache/)) {
    if (tem(/medicamentos|terapeutic|clinic/)) {
      return porEspecie('Ração para Gatos > Nutrição Clínica', 'Ração para Cães > Nutrição Clínica');
    }
    return porEspecie('Ração para Gatos', 'Ração para Cães');
  }
  if (tem(/petisco|bifinho|biscoito|osso|stick|palito|cookie|molho|snack/)) {
    return porEspecie('Ração para Gatos > Petiscos para Gatos', 'Ração para Cães > Petiscos para Cães');
  }
  if (tem(/vitamina|suplement/)) return 'Medicamentos > Vitaminas e Suplementos';
  if (tem(/farmacia|medicament|antiacido|infeccao|coracao|\/pele|vermifug|antipulga/)) return 'Medicamentos';
  if (tem(/areia|banheiro|caixa de areia/)) return 'Higiene e Limpeza > Areia Higiênica';
  if (tem(/comedouro|bebedouro|acessorios (para|de) alimentacao/)) return 'Acessórios > Comedouros e Bebedouros';
  if (tem(/coleira|guia|peitoral/)) return 'Acessórios > Coleiras e Guias';
  if (tem(/transporte|caixas de transporte|capas para banco|focinheira/)) return 'Acessórios > Transporte';
  if (tem(/arranhador|brinquedo|mordedor|bolinha/)) return 'Brinquedos';
  if (tem(/cama|colchao|casinha|tapete/)) return 'Acessórios > Camas e Tapetes';
  if (tem(/roupa|vestuario|camiseta/)) return 'Acessórios > Roupas';
  if (tem(/beleza|higiene|banho|sabonete|shampoo|perfume|colonia|escova|pente|rasqueadeira|unha|dente|odor|limpeza|controle de praga/)) {
    return 'Higiene e Limpeza';
  }
  if (tem(/colar elizabetano|protecao e adestramento|escada/)) return 'Acessórios';
  return null;
}
