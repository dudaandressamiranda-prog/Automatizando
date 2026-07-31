/**
 * Lista de fusão: produtos cadastrados duas vezes no catálogo.
 *
 * São os casos em que um produto está sem código de barras, o código dele
 * EXISTE na planilha de origem, mas quem já é dono desse código é outro
 * cadastro do próprio catálogo — ou seja, não falta dado, sobra cadastro.
 * Acontece quando o mesmo item entrou por caminhos diferentes: "SILICA
 * GROSSA GREAT PETS 1,6KG" e "AREIA SILICA GROSSA 1,6KG" são o mesmo saco
 * de areia.
 *
 * O relatório põe os dois lado a lado e diz o que fazer com cada par. A
 * regra de quem fica é simples: fica quem tem o código de barras, porque é
 * ele que a etiqueta e o leitor do caixa reconhecem. Mas o repetido pode
 * ter coisa que o mantido não tem — foto, categoria certa — e isso precisa
 * ser levado antes de tirar da vitrine.
 *
 * NUNCA apaga. Produto apagado sai junto dos carrinhos das lojas (o
 * cart_items tem "on delete cascade"), e some o histórico de reposição de
 * quem montou aquele carrinho. Fusão aqui é desativar o repetido — dá para
 * voltar atrás, apagar não dá.
 *
 * Uso:
 *   npm run fusao -- planilha-chefe.csv tiny.csv           # só o relatório
 *   npm run fusao -- planilha-chefe.csv tiny.csv --apply   # executa a fusão
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import { Indice, carregarFontes } from './lib/similar.js';

const ARQUIVO = 'fusao.xlsx';
const VERDE = 'FF25756C';

interface Prod {
  id: string;
  name: string;
  brand: string | null;
  status: string;
  status_manual: boolean;
  barcode: string | null;
  photo_path: string | null;
  photo_source_url: string | null;
  category_id: string | null;
  created_at: string;
}

/**
 * A foto do catálogo mora em photo_source_url (o link de onde ela veio no
 * painel); photo_path é o arquivo já subido para o bucket, que quase
 * nenhum produto tem. Quem só olha photo_path conclui que o catálogo
 * inteiro está sem foto.
 */
const temFoto = (p: Prod) => Boolean(p.photo_path || p.photo_source_url);

interface Par {
  repetido: Prod;
  mantido: Prod;
  ean: string;
  nomeFonte: string;
  score: number;
  carrinhos: number;
  acao: string;
  levarFoto: boolean;
  levarCategoria: boolean;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const arquivos = args.filter((a) => !a.startsWith('--'));
  if (arquivos.length === 0) {
    throw new Error('Informe as planilhas: npm run fusao -- chefe.csv tiny.csv');
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.');
  const db = createClient(url, key, { auth: { persistSession: false } });

  console.log('Lendo as planilhas...');
  const fontes = await carregarFontes(arquivos);
  const indice = new Indice(fontes);

  const { data: cats, error: erroCats } = await db.from('categories').select('id, name');
  if (erroCats) throw new Error(erroCats.message);
  const nomeCat = new Map((cats ?? []).map((c) => [c.id as string, c.name as string]));

  console.log('Consultando o catálogo...');
  const prods: Prod[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('products')
      .select('id, name, brand, status, status_manual, barcode, photo_path, photo_source_url, category_id, created_at')
      .order('id')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    prods.push(...((data ?? []) as Prod[]));
    if (!data || data.length < 1000) break;
  }
  const porEan = new Map<string, Prod>();
  for (const p of prods) if (p.barcode) porEan.set(p.barcode, p);
  const alvos = prods.filter((p) => !p.barcode && p.status === 'ativo');
  console.log(`  ${alvos.length} produtos ativos sem código.`);

  // quem é o par de quem
  const pares: Par[] = [];
  for (const p of alvos) {
    const { candidatos } = indice.procurar(p.name, p.brand);
    if (candidatos.length === 0) continue;

    let melhor = candidatos[0]!;
    if (!melhor.f.eanValido) {
      const bom = candidatos.find(
        (x) => x.f.eanValido && x.exato === melhor.exato && x.score >= melhor.score - 0.05,
      );
      if (bom) melhor = bom;
    }
    // empate em códigos diferentes é cadastro pai com variações, não repetição
    const topo = candidatos.filter((x) => x.exato === melhor.exato && x.score >= melhor.score - 0.02);
    if (new Set(topo.map((x) => x.f.ean)).size > 1) continue;

    const mantido = porEan.get(melhor.f.ean);
    if (!mantido) continue; // ninguém tem esse código ainda: é caso do caca-ean

    pares.push({
      repetido: p, mantido, ean: melhor.f.ean, nomeFonte: melhor.f.nome, score: melhor.score,
      carrinhos: 0, acao: '', levarFoto: false, levarCategoria: false,
    });
  }

  // o repetido pode estar em carrinho de loja — isso muda a ordem do serviço
  if (pares.length > 0) {
    const ids = pares.map((x) => x.repetido.id);
    const contagem = new Map<string, number>();
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await db
        .from('cart_items')
        .select('product_id')
        .in('product_id', ids.slice(i, i + 100));
      if (error) throw new Error(error.message);
      for (const r of data ?? []) {
        const k = r.product_id as string;
        contagem.set(k, (contagem.get(k) ?? 0) + 1);
      }
    }
    for (const par of pares) par.carrinhos = contagem.get(par.repetido.id) ?? 0;
  }

  // o que fazer em cada par
  for (const par of pares) {
    const passos: string[] = [];
    par.levarFoto = temFoto(par.repetido) && !temFoto(par.mantido);
    par.levarCategoria = Boolean(par.repetido.category_id) && !par.mantido.category_id;
    if (par.levarFoto) passos.push('levar a foto para o mantido');
    if (par.levarCategoria) passos.push('levar a categoria para o mantido');
    if (par.mantido.status !== 'ativo') passos.push(`⚠ o mantido está ${par.mantido.status} — reativar`);
    if (par.carrinhos > 0) passos.push(`⚠ está em ${par.carrinhos} carrinho(s) — trocar pelo mantido`);
    if (par.repetido.status_manual) passos.push('⚠ você já mexeu neste cadastro à mão');
    passos.push('desativar o repetido');
    par.acao = passos.join('; ');
  }

  pares.sort((a, b) => a.repetido.name.localeCompare(b.repetido.name, 'pt-BR'));

  const comFoto = pares.filter((p) => p.levarFoto).length;
  const emCarrinho = pares.filter((p) => p.carrinhos > 0).length;
  const manualzinho = pares.filter((p) => p.repetido.status_manual).length;
  const mantidoInativo = pares.filter((p) => p.mantido.status !== 'ativo').length;

  console.log('');
  console.log(`Pares para fundir:                         ${pares.length}`);
  console.log(`  o repetido tem foto e o mantido não:     ${comFoto}`);
  console.log(`  o repetido está em algum carrinho:       ${emCarrinho}`);
  console.log(`  o mantido está inativo (precisa voltar): ${mantidoInativo}`);
  console.log(`  cadastro que você já mexeu à mão:        ${manualzinho}`);

  // ---- relatório -------------------------------------------------------
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Fusão');
  ws.columns = [
    { header: 'DESATIVAR — cadastro repetido', key: 'rnome', width: 48 },
    { header: 'Foto', key: 'rfoto', width: 7 },
    { header: 'Categoria', key: 'rcat', width: 26 },
    { header: 'MANTER — cadastro com código', key: 'mnome', width: 48 },
    { header: 'Código', key: 'ean', width: 17 },
    { header: 'Foto', key: 'mfoto', width: 7 },
    { header: 'Categoria', key: 'mcat', width: 26 },
    { header: 'Situação do mantido', key: 'mstatus', width: 14 },
    { header: 'O que fazer', key: 'acao', width: 58 },
    { header: 'Nome na planilha (a prova)', key: 'fonte', width: 46 },
    { header: 'Nota', key: 'score', width: 7 },
    { header: 'ID do repetido', key: 'rid', width: 38 },
    { header: 'ID do mantido', key: 'mid', width: 38 },
  ];
  for (const p of pares) {
    const linha = ws.addRow({
      rnome: p.repetido.name,
      rfoto: temFoto(p.repetido) ? 'sim' : 'não',
      rcat: p.repetido.category_id ? nomeCat.get(p.repetido.category_id) ?? '' : '',
      mnome: p.mantido.name,
      ean: p.ean,
      mfoto: temFoto(p.mantido) ? 'sim' : 'não',
      mcat: p.mantido.category_id ? nomeCat.get(p.mantido.category_id) ?? '' : '',
      mstatus: p.mantido.status,
      acao: p.acao,
      fonte: p.nomeFonte,
      score: Number(p.score.toFixed(3)),
      rid: p.repetido.id,
      mid: p.mantido.id,
    });
    linha.getCell('ean').numFmt = '@';
    // vermelho claro no que sai, verde claro no que fica
    for (const c of ['rnome', 'rfoto', 'rcat']) {
      linha.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDEAEA' } };
    }
    for (const c of ['mnome', 'ean', 'mfoto', 'mcat', 'mstatus']) {
      linha.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7F5EC' } };
    }
    if (p.carrinhos > 0 || p.repetido.status_manual || p.mantido.status !== 'ativo') {
      linha.getCell('acao').font = { bold: true, color: { argb: 'FFB3261E' } };
    }
  }
  const cab = ws.getRow(1);
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
  cab.height = 24;
  cab.alignment = { vertical: 'middle', wrapText: true };
  ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 1 }];
  ws.autoFilter = 'A1:M1';

  await wb.xlsx.writeFile(ARQUIVO);
  console.log(`\nRelatório: ${ARQUIVO}`);

  if (!apply) {
    console.log('Nada foi alterado. Rode com --apply para executar a fusão.');
    return;
  }

  console.log('\nExecutando a fusão...');
  let fotos = 0;
  let cats2 = 0;
  for (const par of pares) {
    const mudanca: Record<string, unknown> = {};
    if (par.levarFoto) {
      if (par.repetido.photo_path) mudanca.photo_path = par.repetido.photo_path;
      if (par.repetido.photo_source_url) mudanca.photo_source_url = par.repetido.photo_source_url;
      fotos++;
    }
    if (par.levarCategoria) { mudanca.category_id = par.repetido.category_id; cats2++; }
    if (Object.keys(mudanca).length > 0) {
      const { error } = await db.from('products').update(mudanca).eq('id', par.mantido.id);
      if (error) throw new Error(`Erro levando dados para "${par.mantido.name}": ${error.message}`);
    }
    // status_manual: a fusão é decisão sua, então nenhuma importação futura
    // pode reativar o repetido por conta própria
    const { error } = await db
      .from('products')
      .update({ status: 'desativado', status_manual: true })
      .eq('id', par.repetido.id);
    if (error) throw new Error(`Erro desativando "${par.repetido.name}": ${error.message}`);
  }
  console.log(`✅ ${pares.length} repetidos desativados.`);
  console.log(`   ${fotos} fotos e ${cats2} categorias levadas para o cadastro mantido.`);
  console.log('   Nenhum produto foi apagado — dá para reativar pela tela de admin.');
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
