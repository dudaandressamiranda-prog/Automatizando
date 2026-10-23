/**
 * Varredura do Tiny em segundo plano.
 *
 * A listagem do Tiny (100 por página) não traz foto nem marca: isso só vem
 * consultando produto por produto, e a conta tem limite de 60 consultas por
 * minuto. Com ~15 mil cadastros a primeira varredura leva horas — então ela
 * roda aqui, em fatias de ~100 s: cada execução trabalha, grava o progresso
 * em `tiny_varredura` e chama a si mesma para continuar. A tela só
 * acompanha; pode ser fechada.
 *
 * Etapas:
 *   1. listando   — todas as páginas de produtos.pesquisa → tiny_produtos
 *   2. detalhando — produto.obter só de quem interessa (fora do catálogo,
 *                   com código, não kit, não "pai"), via tiny_a_detalhar()
 *   3. pronta     — a prévia (view tiny_candidatos) mostra os completos
 *
 * Quem grava no catálogo é o app, depois que o admin escolhe na prévia.
 *
 * Ações (POST):
 *   { acao: 'iniciar' | 'parar' | 'retomar' }  — admin
 *   { acao: 'continuar', execucao }            — só a própria função
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const db = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });

const TINY = 'https://api.tiny.com.br/api2/';
/** Cada execução trabalha isto e passa o bastão (o limite do plano é 150 s). */
const FATIA_MS = 100_000;
/**
 * Espaço entre consultas: ~50 por minuto. Fica abaixo do limite de 60 de
 * propósito — a mesma conta atende outras integrações, que não podem ser
 * barradas por causa da varredura.
 */
const INTERVALO_MS = 1_200;
/** Sem notícia da varredura há mais que isso, ela é considerada travada. */
const PARADA_APOS_MS = 4 * 60_000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const agora = () => new Date().toISOString();

// deno-lint-ignore no-explicit-any
type Json = any;

// ---- Tiny ------------------------------------------------------------------
// (mesmo cliente da função tiny-produto; cada função é publicada sozinha)

class ErroTiny extends Error {
  constructor(mensagem: string, readonly codigo: string = '') {
    super(mensagem);
  }
}
const NAO_ENCONTRADO = '20';
const BLOQUEADO = '6';

let ultimaChamada = 0;

async function tiny(metodo: string, params: Record<string, string>): Promise<Json> {
  const token = Deno.env.get('TINY_TOKEN');
  if (!token) throw new ErroTiny('Falta o segredo TINY_TOKEN no Supabase.');
  for (let tentativa = 1; ; tentativa++) {
    const espera = ultimaChamada + INTERVALO_MS - Date.now();
    if (espera > 0) await dormir(espera);
    ultimaChamada = Date.now();
    try {
      const r = await fetch(TINY + metodo, {
        method: 'POST',
        body: new URLSearchParams({ token, formato: 'json', ...params }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok) throw new ErroTiny(`O Tiny respondeu HTTP ${r.status}.`);
      const { retorno } = await r.json();
      if (retorno?.status === 'OK') return retorno;
      const erro = new ErroTiny(
        String(retorno?.erros?.[0]?.erro ?? 'erro desconhecido do Tiny'),
        String(retorno?.codigo_erro ?? ''),
      );
      if (erro.codigo !== BLOQUEADO) throw erro;
      if (tentativa >= 3) throw erro;
      await dormir(30_000); // passou do limite por minuto: espera e tenta de novo
    } catch (e) {
      if (e instanceof ErroTiny || tentativa >= 3) throw e;
      await dormir(3_000); // rede instável: mais uma tentativa
    }
  }
}

const ehImagem = (url: string) => /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url);
const texto = (v: unknown) => String(v ?? '').trim() || null;

function fotosDe(p: Json): string[] {
  const anexos = ((p.anexos ?? []) as Json[]).map((a) => (typeof a === 'string' ? a : a?.anexo));
  const externas = ((p.imagens_externas ?? []) as Json[]).map((i) =>
    typeof i === 'string' ? i : (i?.imagem_externa?.url ?? i?.url),
  );
  return [...anexos, ...externas].filter((u): u is string => typeof u === 'string' && ehImagem(u));
}

/** "23/10/2026 14:05:00" (horário de Brasília) → ISO. */
function dataTiny(s: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}):(\d{2}))?/.exec(s ?? '');
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}T${m[4] ?? '00'}:${m[5] ?? '00'}:${m[6] ?? '00'}-03:00`;
}
function paraTiny(d: Date): string {
  const br = new Date(d.getTime() - 3 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(br.getUTCDate())}/${p(br.getUTCMonth() + 1)}/${br.getUTCFullYear()} ${p(br.getUTCHours())}:${p(br.getUTCMinutes())}:00`;
}

// ---- estado ----------------------------------------------------------------

async function lerEstado(): Promise<Json> {
  const { data, error } = await db.from('tiny_varredura').select('*').eq('id', 1).single();
  if (error) throw error;
  return data;
}

async function salvar(campos: Record<string, unknown>) {
  const { error } = await db.from('tiny_varredura').update({ ...campos, atualizada_em: agora() }).eq('id', 1);
  if (error) throw error;
}

/** Só a execução atual trabalha: parar ou reiniciar troca o identificador. */
async function aindaMinha(execucao: string): Promise<boolean> {
  const e = await lerEstado();
  return e.execucao === execucao && (e.estado === 'listando' || e.estado === 'detalhando');
}

async function passarBastao(execucao: string) {
  await fetch(`${SB_URL}/functions/v1/tiny-varredura`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ acao: 'continuar', execucao }),
  });
}

// ---- etapas ----------------------------------------------------------------

async function listarPagina(pagina: number): Promise<number> {
  let r: Json;
  try {
    r = await tiny('produtos.pesquisa.php', { pesquisa: '', pagina: String(pagina) });
  } catch (e) {
    if (e instanceof ErroTiny && e.codigo === NAO_ENCONTRADO) return 0;
    throw e;
  }
  const linhas = ((r.produtos ?? []) as Json[]).map((x) => x.produto).filter(Boolean).map((p) => ({
    tiny_id: String(p.id),
    nome: String(p.nome ?? '').trim() || '(sem nome)',
    gtin: texto(p.gtin),
    codigo: texto(p.codigo),
    situacao: texto(p.situacao),
    tipo_variacao: texto(p.tipoVariacao),
    listado_em: agora(),
  }));
  if (linhas.length) {
    // upsert só com as colunas da listagem: o detalhe já consultado fica
    const { error } = await db.from('tiny_produtos').upsert(linhas, { onConflict: 'tiny_id' });
    if (error) throw error;
  }
  return Number(r.numero_paginas) || pagina;
}

/** Marca o que mudou no Tiny desde a última varredura (a API só dá 30 dias). */
async function marcarAlterados(desde: Date) {
  const limite = new Date(Date.now() - 29 * 86_400_000);
  const inicio = desde > limite ? desde : limite;
  for (let pagina = 1; ; pagina++) {
    let r: Json;
    try {
      r = await tiny('lista.atualizacoes.produtos.php', { dataAlteracao: paraTiny(inicio), pagina: String(pagina) });
    } catch (e) {
      if (e instanceof ErroTiny && e.codigo === NAO_ENCONTRADO) return;
      throw e;
    }
    for (const x of (r.produtos ?? []) as Json[]) {
      const p = x.produto;
      const quando = dataTiny(p?.data_alteracao);
      if (p?.id && quando) {
        await db.from('tiny_produtos').update({ alterado_no_tiny: quando }).eq('tiny_id', String(p.id));
      }
    }
    if (pagina >= Number(r.numero_paginas || 1)) return;
  }
}

async function detalhar(id: string) {
  let p: Json;
  try {
    p = (await tiny('produto.obter.php', { id })).produto;
  } catch (e) {
    if (e instanceof ErroTiny && e.codigo === NAO_ENCONTRADO) {
      // apagado no Tiny entre a listagem e agora: fica sem foto (não entra)
      await db.from('tiny_produtos').update({ fotos: [], detalhado_em: agora() }).eq('tiny_id', id);
      return;
    }
    throw e;
  }
  const { error } = await db.from('tiny_produtos').update({
    nome: String(p.nome ?? '').trim() || '(sem nome)',
    gtin: texto(p.gtin),
    codigo: texto(p.codigo),
    situacao: texto(p.situacao),
    tipo_variacao: texto(p.tipoVariacao),
    marca: texto(p.marca),
    fornecedor: texto(p.nome_fornecedor),
    categoria: texto(p.categoria),
    fotos: fotosDe(p),
    kit: p.classe_produto === 'K',
    detalhado_em: agora(),
  }).eq('tiny_id', id);
  if (error) throw error;
}

async function trabalhar(execucao: string) {
  const fim = Date.now() + FATIA_MS;
  try {
    let e = await lerEstado();
    if (e.execucao !== execucao) return;

    if (e.estado === 'listando') {
      let pagina = e.pagina as number;
      while (Date.now() < fim) {
        pagina += 1;
        const paginas = await listarPagina(pagina);
        if (!(await aindaMinha(execucao))) return;
        const acabou = paginas === 0 || pagina >= paginas;
        await salvar({
          pagina,
          paginas: paginas || e.paginas,
          mensagem: `Listando os cadastros do Tiny… página ${pagina} de ${paginas || e.paginas || '?'}`,
        });
        if (acabou) {
          const anterior = (await db.from('tiny_varredura').select('concluida_em').eq('id', 1).single()).data;
          await marcarAlterados(anterior?.concluida_em ? new Date(anterior.concluida_em) : new Date(0));
          const { data: n } = await db.rpc('tiny_conta_a_detalhar');
          await salvar({
            estado: 'detalhando', detalhados: 0, a_detalhar: n ?? 0,
            mensagem: `Consultando foto e marca de ${n ?? 0} cadastros fora do catálogo…`,
          });
          e = await lerEstado();
          break;
        }
      }
    }

    if (e.estado === 'detalhando') {
      if (e.a_detalhar == null) {
        const { data: n } = await db.rpc('tiny_conta_a_detalhar');
        await salvar({ a_detalhar: n ?? 0 });
        e = await lerEstado();
      }
      let feitos = e.detalhados as number;
      while (Date.now() < fim) {
        const { data: ids, error } = await db.rpc('tiny_a_detalhar', { limite: 10 });
        if (error) throw error;
        if (!ids?.length) {
          await salvar({ estado: 'pronta', concluida_em: agora(), execucao: null, mensagem: 'Varredura concluída.' });
          return;
        }
        for (const id of ids as string[]) {
          if (Date.now() >= fim) break;
          await detalhar(id);
          feitos++;
        }
        if (!(await aindaMinha(execucao))) return;
        await salvar({ detalhados: feitos, mensagem: `Consultando foto e marca… ${feitos} de ${e.a_detalhar ?? '?'}` });
      }
    }

    if (await aindaMinha(execucao)) await passarBastao(execucao);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String((err as Json)?.message ?? err);
    try {
      if (await aindaMinha(execucao)) await salvar({ estado: 'erro', mensagem: `Parou com erro: ${msg}` });
    } catch {
      /* sem banco: nada a fazer */
    }
  }
}

// ---- entrada ---------------------------------------------------------------

async function admin(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? '';
  const sb = createClient(SB_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
  return data.user?.app_metadata?.role === 'admin' ? (data.user.email ?? 'admin') : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erro: 'Use POST.' }, 405);

  let corpo: Json = {};
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: 'Corpo inválido.' }, 400);
  }

  if (corpo.acao === 'continuar') {
    if (req.headers.get('Authorization') !== `Bearer ${SERVICE}`) return json({ erro: 'Não autorizado.' }, 403);
    EdgeRuntime.waitUntil(trabalhar(String(corpo.execucao)));
    return json({ ok: true }, 202);
  }

  const quem = await admin(req);
  if (!quem) return json({ erro: 'Só administradores podem fazer a varredura do Tiny.' }, 403);

  const e = await lerEstado();
  const rodando = (e.estado === 'listando' || e.estado === 'detalhando') &&
    e.atualizada_em && Date.now() - new Date(e.atualizada_em).getTime() < PARADA_APOS_MS;

  if (corpo.acao === 'iniciar') {
    if (rodando) return json({ erro: 'Já existe uma varredura em andamento.' }, 409);
    const execucao = crypto.randomUUID();
    await salvar({
      estado: 'listando', execucao, pagina: 0, paginas: null, detalhados: 0, a_detalhar: null,
      iniciada_em: agora(), iniciada_por: quem, mensagem: 'Começando a listar os cadastros do Tiny…',
    });
    EdgeRuntime.waitUntil(trabalhar(execucao));
    return json({ ok: true }, 202);
  }

  if (corpo.acao === 'retomar') {
    if (rodando) return json({ erro: 'A varredura já está andando.' }, 409);
    if (!['listando', 'detalhando', 'erro'].includes(e.estado)) {
      return json({ erro: 'Não há varredura para retomar — inicie uma nova.' }, 409);
    }
    const etapa = e.paginas && e.pagina >= e.paginas ? 'detalhando' : 'listando';
    const execucao = crypto.randomUUID();
    await salvar({ estado: etapa, execucao, mensagem: 'Retomando…' });
    EdgeRuntime.waitUntil(trabalhar(execucao));
    return json({ ok: true }, 202);
  }

  if (corpo.acao === 'parar') {
    await salvar({ estado: 'parada', execucao: null, mensagem: `Parada por ${quem}.` });
    return json({ ok: true });
  }

  return json({ erro: 'Ação desconhecida.' }, 400);
});
