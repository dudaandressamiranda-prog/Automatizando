import { norm } from './normalize.js';

/**
 * Classificador da categoria Medicamentos.
 *
 * Faz duas coisas, nesta ordem:
 *
 * 1. Tira o que não é medicamento. A categoria acumulou ração de nutrição
 *    clínica, curativo, casco bovino, shampoo de tratamento — coisas que
 *    têm dono melhor em outra categoria.
 *
 * 2. Divide o que sobra pelo tipo de tratamento, que quase sempre está no
 *    próprio nome ("Anti-inflamatório Carproflan", "Vermífugo Endal").
 *    Quando o nome não diz, a marca resolve: Simparic e NexGard são
 *    antipulgas mesmo sem a palavra aparecer.
 *
 * Devolve null quando não dá para ter certeza — nesse caso o produto fica
 * em "Medicamentos" mesmo, sem subcategoria, esperando revisão manual.
 */

/*
 * Marcas cujo nome já diz o tipo, mesmo sem a palavra no rótulo. É por aqui
 * que a maioria dos remédios é classificada: o rótulo comercial raramente
 * escreve "antipulgas", escreve "Simparic" ou "FRONT. PLUS".
 */
const MARCAS_ANTIPULGAS =
  /simparic|nexgard|bravecto|revolution|advocate|credeli|\bfront\b|front\.|frontline|frontmax|comfortis|capstar|seresto|scalibor|ectofend|effipro|efipet|ectoline|fipronil|pulvex|advantage|butox|defendog|canis full|spot on|endospot|vectra|triatox|amitraz|\bsarn|fluido ibasa|ivermectina/;

const MARCAS_VERMIFUGO =
  /endogard|endal|drontal|vermivet|giardicid|grantelm|helmiantex|prazi|vermitrat|canex|vetmax|milteforan|leishman/;

const MARCAS_ANTIBIOTICO =
  /agemoxi|baytril|clinbacter|oralguard|enrofloxacin|clindamicina|marbofloxacin|antimicrobian|clavamox|synulox|celesporin|cefalosporin|trissulfin|afectrim|\bsulf|terramicina|tilosina/;

const MARCAS_ANTIINFLAMATORIO =
  /alcort|galliprant|numelvi|aliv pet|prednon|maxicam|flogiletas|previcox|rimadyl|onsior|ketojet|carproflan|flamavet|gelopan|trocoxil|cronidor|dipirona|tramadol|banamine/;

const MARCAS_SUPLEMENTO =
  /aminocanis|aminomix|nuxcell|lactobac|promun|eritros|imderme|pelo e derme|hemolitan|organnact|potenay|glicopan|calcio|fosfor|condroton|triflex|gerioox|nutrifull|nutricore|ferrofood|\bflora\b|up flora|sec lac|\bnutri/;

const MARCAS_CARDIORRENAL =
  /petpril|zelotril|enalapril|furolisin|furosemida|revimax|propentofilina|benazepril|pimobendan|vetmedin/;

const MARCAS_DIGESTIVO = /vonau|ondansetron|mirtz|mirtazapin|omeprazol|ranitidina|emedron|metoclopramida/;

const MARCAS_COMPORTAMENTO = /adaptil|feliway|zylkene|acalm|serenus|florapet|alizin/;

export interface MedResultado {
  categoria: string;
  /** true = saiu de Medicamentos (não era remédio). */
  mudouDeArea: boolean;
}

export function classifyMedicamento(nome: string): MedResultado | null {
  const n = ` ${norm(nome)} `;
  const tem = (rx: RegExp) => rx.test(n);
  const fora = (categoria: string): MedResultado => ({ categoria, mudouDeArea: true });
  const dentro = (sub: string): MedResultado => ({ categoria: `Medicamentos > ${sub}`, mudouDeArea: false });

  const gato = tem(/\bgat[oa]s?\b|\bfelin/);

  // ---- 1. o que não é medicamento -------------------------------------

  // RPC = Roupa Para Castração, a vestimenta pós-cirúrgica. Os sufixos
  // "| 0", "| 00", "| 12" são tamanhos e "DRY / LIGHT / SUPREME" são linhas
  // de tecido — nada disso é medicamento nem ração.
  if (tem(/\brpc\b|roupa para castracao|roupa cirurgica|roupa pos.?cirurgic/)) {
    return fora('Acessórios > Roupas > RPC');
  }

  // Petisco vem antes da regra de ração: "Petisco Vet Life RENAL Dental"
  // tem "vet life" no nome, mas é petisco, não ração de tratamento.
  if (tem(/petisco|bifinho|\bsnack\b|biscoito/)) {
    return fora(gato ? 'Ração para Gatos > Petiscos para Gatos' : 'Ração para Cães > Petiscos para Cães');
  }

  // Ração de nutrição clínica é ração. Sachê/patê vai para úmida (regra da
  // casa); o resto fica em "Tratamento", que é onde mora a linha veterinária.
  if (tem(/\bracao\b|\bracoes\b|veterinary diet|vet life|nutricao clinica/)) {
    if (tem(/\bsache\b|\bpate\b|\bwet\b|\bumid/)) {
      return fora(gato ? 'Ração para Gatos > Ração Úmida' : 'Ração para Cães > Ração Úmida');
    }
    return fora(gato ? 'Ração para Gatos > Tratamento' : 'Ração para Cães > Tratamento');
  }
  if (tem(/\bsache\b|\bpate\b/) && !tem(/suplement|vermifug|antipulga/)) {
    return fora(gato ? 'Ração para Gatos > Ração Úmida' : 'Ração para Cães > Ração Úmida');
  }

  // Curativo e bandagem são material de enfermagem — vão com fraldas.
  if (tem(/curativo|bandagem|bandpet|\bgaze\b|atadura|esparadrapo/)) {
    return fora('Higiene e Limpeza > Fraldas e Tapetes Higiênicos');
  }

  // Utensílio, não remédio.
  if (tem(/aplicador de comprimido|porta comprimido|\bseringa\b|dosador\b/) && !tem(/solucao|oral\b/)) {
    return fora('Acessórios');
  }

  // Casco, orelha e osso natural são petisco mastigável (osso de silicone
  // já é brinquedo por outra regra, no classificador geral).
  if (tem(/casco bovino|orelha bovina|\btraqueia\b|\bmocoto\b|osso defumado|osso natural/)) {
    return fora(gato ? 'Ração para Gatos > Petiscos para Gatos' : 'Ração para Cães > Petiscos para Cães');
  }

  // Shampoo e sabonete medicinais têm subcategoria própria em Higiene.
  if (tem(/shampoo|xampu|sabonete|condicionador/)) {
    return fora('Higiene e Limpeza > Shampoos de Tratamento');
  }

  // ---- 2. tipo de medicamento -----------------------------------------
  // Coleira antiparasitária continua em Medicamentos (regra da casa), então
  // vem antes de qualquer regra de acessório.

  if (tem(/antipulga|carrapaticida|\bcarrapato|ectoparasit|\bpipeta/) || tem(MARCAS_ANTIPULGAS)) {
    return dentro('Antipulgas e Carrapatos');
  }
  if (tem(/vermifug|antihelmintic|verminose|giardia|antiparasitario/) || tem(MARCAS_VERMIFUGO)) {
    return dentro('Vermífugos');
  }
  if (
    tem(/anti-?inflamatorio|antiinflamatorio|\bcorticoid|analgesic|\bdor\b|meloxicam|carprofen|firocoxib|prednisolona|dexametasona|relaxante muscular/) ||
    tem(MARCAS_ANTIINFLAMATORIO)
  ) {
    return dentro('Anti-inflamatórios e Analgésicos');
  }
  if (
    tem(/antibiotic|antibacterian|amoxicilina|cefalexina|doxiciclina|metronidazol|azitromicina|sulfa/) ||
    tem(MARCAS_ANTIBIOTICO)
  ) {
    return dentro('Antibióticos');
  }
  if (tem(/antifungic|micose|dermatofit|cetoconazol|itraconazol/)) {
    return dentro('Antifúngicos');
  }
  // Ouvido tem produto suficiente para subcategoria própria (limpador
  // auricular, removedor de cerúmen, otológico).
  if (tem(/\botolog|\bouvido|otite|auricular|cerumen|otocare|\botic\b/)) {
    return dentro('Ouvido e Higiene Auricular');
  }
  if (tem(/\bolho|ocular|oftalmic|colirio|eye clean|optivet|\btears\b/)) {
    return dentro('Oftálmicos');
  }
  // Pele e ferida: pomada, cicatrizante, sarna, alergia de pele.
  if (
    tem(/pomada|cicatrizant|\bderma|dermatolog|\bferida|antissept|repelente de moscas|alergovet|allequa|apoquel|cyclavance|ciclosporin|phisioderm|banho seco/)
  ) {
    return dentro('Dermatológicos');
  }
  if (tem(MARCAS_COMPORTAMENTO) || tem(/calmant|ansiedade|comportament|castracao quimica|anticoncepcional|\bcio\b|abortivo/)) {
    return dentro('Comportamento e Reprodução');
  }
  if (tem(/homeopat|homeopet|floral/)) {
    return dentro('Homeopatia e Florais');
  }
  // Suplemento é o maior grupo da categoria: vitamínico, mineral,
  // aminoácido, condroprotetor, ômega.
  if (
    tem(/suplement|vitamin|\bmineral\b|aminoacid|condroprotetor|\bomega\b|\bograx\b|glicosamina|colageno|probiotic|\bpolivitamin|\bdha\b|\bepa\b|imunolog|energetic|fortificante/) ||
    tem(MARCAS_SUPLEMENTO)
  ) {
    return dentro('Suplementos e Vitaminas');
  }
  if (
    tem(/antiemetic|\bvomito|enjoo|diarreia|\bdigestiv|\bgastr|antiacido|\bfigado|hepat|\bflatulenc|laxant|apetite/) ||
    tem(MARCAS_DIGESTIVO)
  ) {
    return dentro('Digestivos e Hepáticos');
  }
  if (tem(/\bcardiac|coracao|\bpressao|hipertens|diuretic|\brenal\b|\burinar|\bcistite/) || tem(MARCAS_CARDIORRENAL)) {
    return dentro('Cardíacos e Renais');
  }
  if (tem(/expectorante|\btosse|respirator|bronq|xarope/)) {
    return dentro('Respiratórios');
  }
  // Higiene bucal com ação terapêutica (antitártaro, solução oral dentária).
  if (tem(/\bdental|\bbucal|tartaro|aquadent|halito/)) {
    return dentro('Saúde Bucal');
  }

  return null; // sem certeza: fica em Medicamentos, para olhar depois
}
