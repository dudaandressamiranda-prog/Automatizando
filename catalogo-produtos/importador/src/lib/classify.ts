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
  // marcas exclusivas de uma espécie ajudam quando o nome não diz "gato"/"cão"
  if (/\bgat[oa]s?\b|\bfelin|\bwhiskas\b|\bsheba\b|\bfriskies\b|\bgourmet\b/.test(n)) return 'gato';
  if (/\bc[aã]es\b|\bcao\b|\bcachorr|\bdog\b|\bfilhote|\bpedigree\b|\bbaby dog\b/.test(n)) return 'cao';
  return null;
}

export function classifyByName(nome: string): string | null {
  const n = ` ${norm(nome)} `;
  const tem = (rx: RegExp) => rx.test(n);
  const esp = especie(n);
  const porEspecie = (gato: string, cao: string) => (esp === 'gato' ? gato : cao);

  // --- Brinquedos e subcategorias (antes de petiscos/camas) ---
  if (tem(/arranhador|\bcat relax\b|super cat/)) return 'Brinquedos > Arranhadores';
  if (tem(/catnip|varinha|\bvara |cat dancer|cat laser|ratinho|abelhinha|libelula/)) return 'Brinquedos > Para Gatos';
  if (tem(/pelucia|\bplush\b/)) return 'Brinquedos > Pelúcias';
  // osso de material sintético é brinquedo (mordedor), não petisco
  if (tem(/mordedor|odontopet/) || (tem(/\bosso\b|ossinho/) && tem(/silicone|plastic|nylon|borracha|vinil|resina|\btpr\b/))) {
    return 'Brinquedos > Mordedores';
  }
  if (tem(/\bbolinha\b|bola de tenis|push ball|duo ball|redondog/)) return 'Brinquedos > Bolas';
  if (tem(/\bbrinquedo\b|\bcorda\b/)) return 'Brinquedos';
  // camas geladas são categoria à parte
  if (tem(/gelad/) && tem(/tapete|cama/)) return 'Acessórios > Camas e Tapetes Geladas';
  if (tem(/caminha|colchonete|\bcama\b|\bmanta\b|\bcobertor\b|casinha|dog house/)) {
    return 'Acessórios > Camas e Casinhas';
  }
  if (tem(/tapete higienico|tapetim|\bfralda/)) {
    return 'Higiene e Limpeza > Fraldas e Tapetes Higiênicos';
  }
  // colar elizabetano, focinheira e protetor de pescoço — categoria própria
  if (tem(/elizabetano|focinheira|\bcone\b|protetor.*pesco/)) return 'Acessórios > Colares e Focinheiras';
  // "grade higiênica" é do banheiro do gato, não portão
  // (o cadastro do ERP escreve "HIGENICA", sem o i — daí o hig\w*)
  if (tem(/grade hig\w*|grade sanitaria/)) return 'Higiene e Limpeza > Areia Higiênica';
  if (tem(/\bgrade\b|portao|port[oõ]es|escada (tub|pet)/)) return 'Acessórios > Portões e Grades';
  if (tem(/adaptil|feliway|feromonio|calmante/)) return 'Medicamentos';
  // coleiras antiparasitárias (por marca ou função) são medicamento, não acessório
  // — avaliado antes da ração úmida, para "sachê antipulgas" não virar comida
  if (tem(/antipulga|carrapat|parasit|vermifug|anti.?inflamat|antibiot|antissept|pomada|colirio|otologic|analgesic|sarnicida|mosquicida|cicatriz|seringa|antialergic|anticoncepcional|antiemetic|vacina|dermatite|frontmax|ectofend|exctofend|seresto|scalibor|leevre|suplement|vitamin|\bomega\b|probiotic|condroprotet/)) {
    return 'Medicamentos';
  }
  // ração úmida (patê, sachê, wet, lata) — ganha até de nutrição clínica
  if (esp && tem(/\bumid|\bwet\b|\bpate\b|\bsache\b|\benlatad|\blata\b|\bmousse\b/)) {
    return porEspecie('Ração para Gatos > Ração Úmida', 'Ração para Cães > Ração Úmida');
  }
  // ração terapêutica SECA é ração de prescrição, não medicamento
  if (tem(/nutricao clinica/) ||
      (tem(/\bracao\b/) && tem(/renal|cardio|hepatic|gastrointestinal|obesidade|hipoalergenic|urinary|struvite|diabetic|dermatolog|medicamentosa/))) {
    return porEspecie('Ração para Gatos > Nutrição Clínica', 'Ração para Cães > Nutrição Clínica');
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
  // laços e enfeites de pelo (adesivo/piercing/presilha) — sob Armarinho
  if (tem(/\blac(o|inho)s?\b|piercing|presilha|(adesivo|enfeite).*(pelo|hair|dog|pet)/)) {
    return 'Armarinho > Laços';
  }
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
    // seca é o padrão (a úmida já foi captada acima)
    if (esp) return porEspecie('Ração para Gatos > Ração Seca', 'Ração para Cães > Ração Seca');
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
