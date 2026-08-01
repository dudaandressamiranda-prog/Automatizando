/**
 * Busca avançada de código de barras nas planilhas de origem.
 *
 * O `recuperar-ean` só aceita casamento perfeito de palavras — é o que se
 * quer quando o script GRAVA sozinho, mas deixa de fora todo produto cujo
 * nome foi digitado diferente no ERP e no painel ("Ração p/ Cães 15kg" vs
 * "RACAO PARA CAO 15 KG"). Este aqui é o oposto: procura fundo, aceita
 * diferença de escrita e devolve um relatório com nota de confiança para
 * conferência humana.
 *
 * Como procura:
 *  1. normaliza abreviação e unidade — "p/"→"para", "500ml"→"500 ml",
 *     "cx"→"caixa", "comp"→"comprimido", "2,5"→"2.5";
 *  2. separa número+unidade em tokens próprios, porque é neles que mora o
 *     erro caro: herdar o EAN do 10 kg para o 15 kg;
 *  3. pesa cada palavra por raridade (IDF) — "para" não vale nada, "apoquel"
 *     vale muito, então o nome genérico não puxa casamento errado;
 *  4. nota = Dice ponderado entre os dois conjuntos de palavras.
 *
 * Travas (o resultado é sugestão, mas sugestão errada custa caro):
 *  - dose/peso/volume: se os dois nomes trazem número, tem que ser o MESMO
 *    conjunto de medidas; diferente reprova na hora;
 *  - marca declarada nos dois lados e divergente reprova;
 *  - EAN precisa ter dígito verificador válido para entrar como ALTA;
 *  - EAN que já pertence a outro produto do catálogo não é sugerido;
 *  - nome que casa com EANs diferentes é cadastro pai com variações — vai
 *    para a aba de conferência em vez de virar sugestão.
 *
 * Uso:
 *   npm run caca-ean -- planilha-chefe.csv tiny.csv
 *   npm run caca-ean -- planilha.csv --apply         # grava só as ALTA
 *   npm run caca-ean -- planilha.csv --apply --media # inclui as MEDIA
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import { Indice, carregarFontes, diagnosticar } from './lib/similar.js';

const ARQUIVO = 'caca-ean.xlsx';
const VERDE = 'FF25756C';

interface Prod {
  id: string;
  name: string;
  brand: string | null;
  status: string;
  barcode: string | null;
}

type Confianca = 'ALTA' | 'MEDIA' | 'BAIXA' | 'CODIGO INVÁLIDO';

interface Achado {
  produto: Prod;
  ean: string;
  nomeFonte: string;
  origem: string;
  score: number;
  confianca: Confianca;
  motivo: string;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const incluirMedia = args.includes('--media');
  const arquivos = args.filter((a) => !a.startsWith('--'));
  if (arquivos.length === 0) {
    throw new Error('Informe as planilhas: npm run caca-ean -- chefe.csv tiny.csv');
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.');
  const db = createClient(url, key, { auth: { persistSession: false } });

  console.log('Lendo as planilhas...');
  const fontes = await carregarFontes(arquivos);
  if (fontes.length === 0) throw new Error('Nenhuma linha com código nas planilhas informadas.');

  const indice = new Indice(fontes);

  console.log('Consultando o catálogo...');
  const prods: Prod[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('products')
      .select('id, name, brand, status, barcode')
      .order('id')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    prods.push(...((data ?? []) as Prod[]));
    if (!data || data.length < 1000) break;
  }
  const jaUsados = new Set(prods.map((p) => p.barcode).filter(Boolean) as string[]);
  const alvos = prods.filter((p) => !p.barcode && p.status === 'ativo');
  console.log(`  ${alvos.length} produtos ativos sem código.`);

  const donoDoEan = new Map<string, string>();
  for (const p of prods) if (p.barcode) donoDoEan.set(p.barcode, p.name);

  const achados: Achado[] = [];
  const variacoes: { nome: string; eans: string[]; exemplos: string; id: string }[] = [];
  const semNada: { p: Prod; quaseFoi: string }[] = [];
  const duplicados: { p: Prod; ean: string; nomeFonte: string; dono: string }[] = [];

  for (const p of alvos) {
    const d = diagnosticar(p.name, p.brand, indice, (e) => jaUsados.has(e));
    if (d.tipo === 'nada') { semNada.push({ p, quaseFoi: d.quaseFoi }); continue; }
    if (d.tipo === 'variacoes') {
      variacoes.push({ nome: p.name, id: p.id, eans: d.eans, exemplos: d.exemplos });
      continue;
    }
    if (d.tipo === 'repetido') {
      // o código existe, só que já tem dono no catálogo: os dois cadastros
      // são o mesmo produto e o caso é de juntar, não de completar EAN
      duplicados.push({
        p, ean: d.melhor.f.ean, nomeFonte: d.melhor.f.nome,
        dono: donoDoEan.get(d.melhor.f.ean) ?? '',
      });
      continue;
    }

    const melhor = d.melhor;
    const ean = melhor.f.ean;

    // duas planilhas apontando o mesmo código é confirmação independente
    const confirmadoPor = new Set(fontes.filter((f) => f.ean === ean).map((f) => f.origem)).size;

    const motivos: string[] = [];
    if (melhor.rel === 'planilha-extra') motivos.push('planilha detalha embalagem que o catálogo não traz');
    if (melhor.rel === 'catalogo-extra') motivos.push('catálogo traz medida que a planilha não tem');
    if (confirmadoPor > 1) motivos.push('mesmo código nas duas planilhas');

    let confianca: Confianca;
    if (!melhor.f.eanValido) {
      // nome bate, mas o código da planilha é inventado (dígito não fecha)
      motivos.unshift('código da planilha é inválido — dígito verificador não fecha');
      confianca = 'CODIGO INVÁLIDO';
    } else if (melhor.exato && melhor.rel === 'igual') confianca = 'ALTA';
    else if (melhor.score >= 0.9 && melhor.rel !== 'catalogo-extra') confianca = 'ALTA';
    else if (melhor.score >= 0.78) confianca = 'MEDIA';
    else confianca = 'BAIXA';

    achados.push({
      produto: p, ean, nomeFonte: melhor.f.nome, origem: melhor.f.origem,
      score: melhor.score, confianca, motivo: motivos.join('; '),
    });
  }

  // Dois produtos do catálogo apontando para o mesmo código são cadastro
  // repetido: o banco só aceita um dono, então o melhor fica e os outros
  // caem para conferência.
  const porEan = new Map<string, Achado[]>();
  for (const a of achados) {
    const l = porEan.get(a.ean);
    if (l) l.push(a);
    else porEan.set(a.ean, [a]);
  }
  let repetidos = 0;
  for (const lista of porEan.values()) {
    if (lista.length < 2) continue;
    lista.sort((x, y) => y.score - x.score);
    for (const a of lista.slice(1)) {
      a.confianca = 'BAIXA';
      a.motivo = [`cadastro repetido — "${lista[0]!.produto.name}" disputa o mesmo código`, a.motivo]
        .filter(Boolean).join('; ');
      repetidos++;
    }
  }

  const ordem: Record<Confianca, number> = { ALTA: 0, MEDIA: 1, BAIXA: 2, 'CODIGO INVÁLIDO': 3 };
  achados.sort((a, b) => ordem[a.confianca] - ordem[b.confianca] || b.score - a.score);

  const conta = (c: Confianca) => achados.filter((a) => a.confianca === c).length;
  console.log('');
  console.log(`Confiança ALTA  (pode gravar):             ${conta('ALTA')}`);
  console.log(`Confiança MEDIA (conferir por cima):       ${conta('MEDIA')}`);
  console.log(`Confiança BAIXA (conferir um a um):        ${conta('BAIXA')}`);
  console.log(`  destes, cadastro repetido no catálogo:   ${repetidos}`);
  console.log(`Código da planilha inválido (é inventado): ${conta('CODIGO INVÁLIDO')}`);
  console.log(`Cadastro pai com variações (não sugere):   ${variacoes.length}`);
  console.log(`Repetido: o código já tem dono no catálogo:${duplicados.length}`);
  console.log(`Sem nada parecido nas planilhas:           ${semNada.length}`);

  // ---- relatório -------------------------------------------------------
  const wb = new ExcelJS.Workbook();
  const cabecalho = (ws: ExcelJS.Worksheet) => {
    const r = ws.getRow(1);
    r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
    r.height = 22;
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  };

  const ws = wb.addWorksheet('Encontrados');
  ws.columns = [
    { header: 'Confiança', key: 'conf', width: 11 },
    { header: 'Produto no catálogo', key: 'nome', width: 50 },
    { header: 'Código encontrado', key: 'ean', width: 18 },
    { header: 'Nome na planilha', key: 'fonte', width: 50 },
    { header: 'Planilha', key: 'origem', width: 22 },
    { header: 'Nota', key: 'score', width: 8 },
    { header: 'Observação', key: 'motivo', width: 40 },
    { header: 'ID no sistema', key: 'id', width: 38 },
  ];
  const COR: Record<Confianca, string> = {
    ALTA: 'FFE7F5EC', MEDIA: 'FFFFF8E1', BAIXA: 'FFFDEAEA', 'CODIGO INVÁLIDO': 'FFEDE7F6',
  };
  for (const a of achados) {
    const linha = ws.addRow({
      conf: a.confianca, nome: a.produto.name, ean: a.ean, fonte: a.nomeFonte,
      origem: a.origem, score: Number(a.score.toFixed(3)), motivo: a.motivo, id: a.produto.id,
    });
    linha.getCell('ean').numFmt = '@';
    linha.getCell('conf').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR[a.confianca] } };
  }
  ws.autoFilter = 'A1:H1';
  cabecalho(ws);

  const wv = wb.addWorksheet('Variações');
  wv.columns = [
    { header: 'Produto no catálogo', key: 'nome', width: 50 },
    { header: 'Códigos possíveis', key: 'eans', width: 40 },
    { header: 'Nomes na planilha', key: 'exemplos', width: 80 },
    { header: 'ID no sistema', key: 'id', width: 38 },
  ];
  for (const v of variacoes) {
    wv.addRow({ nome: v.nome, eans: v.eans.join(' / '), exemplos: v.exemplos, id: v.id });
  }
  cabecalho(wv);

  const wd = wb.addWorksheet('Cadastro repetido');
  wd.columns = [
    { header: 'Produto sem código', key: 'nome', width: 50 },
    { header: 'Código encontrado', key: 'ean', width: 18 },
    { header: 'Já pertence a', key: 'dono', width: 50 },
    { header: 'Nome na planilha', key: 'fonte', width: 50 },
    { header: 'ID no sistema', key: 'id', width: 38 },
  ];
  for (const d of duplicados) {
    const linha = wd.addRow({
      nome: d.p.name, ean: d.ean, dono: d.dono, fonte: d.nomeFonte, id: d.p.id,
    });
    linha.getCell('ean').numFmt = '@';
  }
  cabecalho(wd);

  const wn = wb.addWorksheet('Sem candidato');
  wn.columns = [
    { header: 'Produto no catálogo', key: 'nome', width: 55 },
    { header: 'Marca', key: 'marca', width: 22 },
    { header: 'Chegou perto mas reprovou', key: 'quase', width: 60 },
    { header: 'ID no sistema', key: 'id', width: 38 },
  ];
  for (const s of semNada) {
    wn.addRow({ nome: s.p.name, marca: s.p.brand ?? '', quase: s.quaseFoi, id: s.p.id });
  }
  cabecalho(wn);

  await wb.xlsx.writeFile(ARQUIVO);
  console.log(`\nRelatório: ${ARQUIVO}`);

  if (!apply) {
    console.log('Nada foi gravado. Rode com --apply para atribuir as ALTA (--media inclui as MEDIA).');
    return;
  }
  const gravar = achados.filter((a) => a.confianca === 'ALTA' || (incluirMedia && a.confianca === 'MEDIA'));
  for (const a of gravar) {
    const { error } = await db.from('products').update({ barcode: a.ean }).eq('id', a.produto.id);
    if (error) throw new Error(`Erro em "${a.produto.name}": ${error.message}`);
  }
  console.log(`\n✅ ${gravar.length} códigos atribuídos.`);
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
