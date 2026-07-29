/**
 * Classificador de categoria pelo nome do produto.
 *
 * Usado quando a planilha não traz categoria (ex.: a exportação de estoque
 * do painel) ou traz vazia. A ordem das regras importa: as mais específicas
 * vêm primeiro, para evitar falsos amigos — "osso mordedor" é brinquedo e
 * "osso defumado" é petisco; "tapete gelado" é cama e "tapete higiênico" é
 * higiene; "ração renal" é nutrição clínica e não medicamento.
 *
 * Devolve null quando não há certeza — nesse caso o robô de fotos consulta
 * a categoria que as lojas usam para aquele código de barras
 * (lib/storecat.ts), e o que sobrar fica para revisão manual no app.
 */
import { norm } from './normalize.js';

type Especie = 'gato' | 'cao' | null;

function especie(n: string): Especie {
  if (/\bgat[oa]s?\b|\bfelin/.test(n)) return 'gato';
  if (/\bc[aã]es\b|\bcao\b|\bcachorr|\bdog\b|\bfilhote/.test(n)) return 'cao';
  return null;
}

export function classifyByName(nome: string): string | null {
  const n = ` ${norm(nome)} `;
  const tem = (rx: RegExp) => rx.test(n);
  const esp = especie(n);
  const porEspecie = (gato: string, cao: string) => (esp === 'gato' ? gato : cao);

  if (tem(/\b(brinquedo|mordedor|arranhador)\b/)) {
    return tem(/pelucia|boneca/) ? 'Brinquedos > Pelúcias' : 'Brinquedos';
  }
  if (tem(/tapete gelado|caminha|colchonete|\bcama\b|\bmanta\b|\bcobertor\b/)) {
    return 'Acessórios > Camas e Tapetes';
  }
  if (tem(/tapete higienico|tapetim|\bfralda/)) {
    return 'Higiene e Limpeza > Fraldas e Tapetes Higiênicos';
  }
  if (tem(/casinha|dog house/)) return 'Acessórios > Casinhas';
  if (tem(/adaptil|feliway|feromonio|calmante/)) return 'Medicamentos';
  // ração terapêutica é ração (de prescrição), não medicamento
  if (tem(/nutricao clinica/) ||
      (tem(/\bracao\b/) && tem(/renal|cardio|hepatic|gastrointestinal|obesidade|hipoalergenic|urinary|struvite|diabetic|dermatolog|medicamentosa/))) {
    return porEspecie('Ração para Gatos > Nutrição Clínica', 'Ração para Cães > Nutrição Clínica');
  }
  if (tem(/antipulga|carrapat|parasit|vermifug|anti.?inflamat|antibiot|antissept|pomada|colirio|otologic|analgesic|sarnicida|mosquicida|cicatriz|seringa|antialergic|anticoncepcional|antiemetic|vacina|dermatite/)) {
    return 'Medicamentos';
  }
  if (tem(/suplement|vitamin|\bomega\b|probiotic|condroprotet/)) {
    return 'Medicamentos > Vitaminas e Suplementos';
  }
  if (tem(/comedouro|bebedouro|\bfonte\b|mamadeira|\bpote pet\b/)) {
    return 'Acessórios > Comedouros e Bebedouros';
  }
  if (tem(/\b(coleira|guia|peitoral|enforcador)\b/)) return 'Acessórios > Coleiras e Guias';
  if (tem(/\bareia\b|granulado sanitario|serragem|banheiro higienico|cat toilet/)) {
    return 'Higiene e Limpeza > Areia Higiênica';
  }
  if (tem(/shampoo|xampu|sabonete|condicionador|colonia|perfume|talco|escova dental|creme dental|banho a seco|limpa (patas|orelhas|lagrima)|higieniza|rasqueadeira|neutralizador|desinfet/)) {
    return 'Higiene e Limpeza';
  }
  if (tem(/\blac(o|inho)s?\b/)) return 'Acessórios > Laços';
  if (tem(/\b(roupa|roupinha|vestido|camiseta|moletom|casaco|babador)\b/)) return 'Acessórios > Roupas';
  if (tem(/pelucia/)) return 'Brinquedos > Pelúcias';
  if (tem(/osso (macio|texturizado|nylon|borracha)|\bbolinha\b|bola de tenis|\bcorda\b/)) return 'Brinquedos';
  if (tem(/petisco|bifinho|snack|biscoito|\bchuru\b|palito|\bosso\b/)) {
    return porEspecie('Ração para Gatos > Petiscos para Gatos', 'Ração para Cães > Petiscos para Cães');
  }
  if (tem(/\bracao\b|\balimento\b/)) {
    if (tem(/betta|flakes|peixe|aquario/)) return 'Ração para Peixes';
    if (tem(/hamster|roedor|coelho|chinchila|porquinho da india/)) return 'Ração para Roedores';
    if (tem(/reptil|tartaruga|jabuti/)) return 'Ração para Répteis';
    if (esp) return porEspecie('Ração para Gatos', 'Ração para Cães');
    return null; // espécie indefinida: melhor não chutar
  }
  if (tem(/\bsemente/)) return 'Sementes';
  if (tem(/\bfita\b/)) return 'Armarinho > Fitas';
  if (tem(/(caixa|bolsa) (de )?transporte|focinheira/)) return 'Acessórios > Transporte';
  return null;
}

/** A categoria atual já atende à sugestão? (sugestão genérica aceita subcategoria) */
export function categoryMatches(atual: string | null, sugerida: string): boolean {
  if (!atual) return false;
  if (atual === sugerida || atual.startsWith(`${sugerida} >`)) return true;
  for (const raiz of ['Brinquedos', 'Higiene e Limpeza', 'Medicamentos']) {
    if (sugerida === raiz && atual.startsWith(raiz)) return true;
  }
  return false;
}
