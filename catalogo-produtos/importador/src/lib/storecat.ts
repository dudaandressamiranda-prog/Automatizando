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

  if (tem(/racao|alimento umido|sache|umid/)) {
    if (tem(/umid|umida|sache|pate|lata|enlatad/)) {
      return porEspecie('Ração para Gatos > Ração Úmida', 'Ração para Cães > Ração Úmida');
    }
    if (tem(/medicamentos|terapeutic|clinic/)) {
      return porEspecie('Ração para Gatos > Nutrição Clínica', 'Ração para Cães > Nutrição Clínica');
    }
    return porEspecie('Ração para Gatos > Ração Seca', 'Ração para Cães > Ração Seca');
  }
  if (tem(/petisco|bifinho|biscoito|osso|stick|palito|cookie|molho|snack/)) {
    return porEspecie('Ração para Gatos > Petiscos para Gatos', 'Ração para Cães > Petiscos para Cães');
  }
  if (tem(/vitamina|suplement|farmacia|medicament|antiacido|infeccao|coracao|\/pele|vermifug|antipulga/)) {
    return 'Medicamentos';
  }
  if (tem(/areia|banheiro|caixa de areia/)) return 'Higiene e Limpeza > Areia Higiênica';
  if (tem(/comedouro|bebedouro|acessorios (para|de) alimentacao/)) return 'Acessórios > Comedouros e Bebedouros';
  // a loja põe "Colar Elizabetano" em adestramento e "Focinheira" em
  // transporte; no catálogo os dois ficam juntos numa categoria própria
  if (tem(/elizabetano|focinheira/)) return 'Acessórios > Colares e Focinheiras';
  if (tem(/arranhador/)) return 'Acessórios > Arranhadores';
  if (tem(/coleira|guia|peitoral/)) return 'Acessórios > Coleiras e Guias';
  if (tem(/transporte|caixas de transporte|capas para banco/)) return 'Acessórios > Transporte';
  if (tem(/brinquedo|mordedor|bolinha/)) return 'Brinquedos';
  if (tem(/cama|colchao|casinha|tapete/)) return 'Acessórios > Camas e Casinhas';
  if (tem(/roupa|vestuario|camiseta/)) return 'Acessórios > Roupas';
  if (tem(/beleza|higiene|banho|sabonete|shampoo|perfume|colonia|escova|pente|rasqueadeira|unha|dente|odor|limpeza|controle de praga/)) {
    return 'Higiene e Limpeza';
  }
  if (tem(/grade|portao|escada/)) return 'Acessórios > Portões e Grades';
  if (tem(/protecao e adestramento/)) return 'Acessórios';
  return null;
}
