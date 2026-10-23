/**
 * Consulta produtos no Tiny (API v2) pelo código de barras.
 *
 * Existe só para o token do Tiny não ir para o app: tudo que vai no app
 * pode ser lido por quem abre o site (inclusive quem entra sem cadastro), e
 * com o token dá para mexer na conta do Tiny inteira. O token fica no
 * segredo TINY_TOKEN do Supabase e só esta função o enxerga.
 *
 * Só LÊ do Tiny e devolve os dados limpos; quem grava no catálogo é o app,
 * com a sessão de quem pediu — e o banco (RLS) só deixa admin gravar.
 *
 * Entrada:  POST { "eans": ["7891234567895", ...] }  (até 10 por chamada)
 * Saída:    { "resultados": [{ ean, status, produto?, erro? }, ...] }
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TINY = 'https://api.tiny.com.br/api2/';
const MAX_EANS = 10;
// o Tiny limita acessos por minuto; um respiro entre chamadas evita o bloqueio
const PAUSA_MS = 350;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

class ErroTiny extends Error {
  constructor(mensagem: string, readonly codigo: string = '') {
    super(mensagem);
  }
}

// deno-lint-ignore no-explicit-any
type Json = any;

async function tiny(metodo: string, params: Record<string, string>): Promise<Json> {
  const token = Deno.env.get('TINY_TOKEN');
  if (!token) throw new ErroTiny('Falta o segredo TINY_TOKEN no Supabase.');
  const r = await fetch(TINY + metodo, {
    method: 'POST',
    body: new URLSearchParams({ token, formato: 'json', ...params }),
  });
  if (!r.ok) throw new ErroTiny(`O Tiny respondeu HTTP ${r.status}.`);
  const { retorno } = await r.json();
  await dormir(PAUSA_MS);
  if (retorno?.status !== 'OK') {
    const msg = String(retorno?.erros?.[0]?.erro ?? 'erro desconhecido do Tiny');
    throw new ErroTiny(msg, String(retorno?.codigo_erro ?? ''));
  }
  return retorno;
}

// códigos de erro da API v2 do Tiny
const NAO_ENCONTRADO = '20';
const TOKEN_INVALIDO = '1';
const BLOQUEADO = '6'; // excedeu o número de acessos por minuto

const ehImagem = (url: string) => /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url);

/** Kits/combos de marketplace não são produto do catálogo (mesma regra do importador). */
const pareceKit = (nome: string) => /^\s*(kit\b|combo\b|\d+\s*x\s)/i.test(nome);

async function buscar(ean: string) {
  let lista: Json;
  try {
    lista = await tiny('produtos.pesquisa.php', { pesquisa: ean });
  } catch (e) {
    if (e instanceof ErroTiny && e.codigo === NAO_ENCONTRADO) return { ean, status: 'nao_encontrado' };
    throw e;
  }

  // a pesquisa também casa nome e parte do código: só vale o EAN exato. O
  // código de barras pode estar no GTIN ou no "código" (SKU) — no Tiny da
  // loja, vários produtos têm o EAN só no código.
  const candidatos = ((lista.produtos ?? []) as Json[])
    .map((x) => x.produto)
    .filter((p) => p && p.situacao !== 'E' && (p.gtin === ean || p.codigo === ean))
    .sort((a, b) => peso(a, ean) - peso(b, ean));
  if (!candidatos.length) return { ean, status: 'nao_encontrado' };

  const { produto: p } = await tiny('produto.obter.php', { id: String(candidatos[0].id) });
  const nome = String(p.nome ?? '').trim();
  if (p.classe_produto === 'K' || pareceKit(nome)) return { ean, status: 'kit', nome };

  const anexos = ((p.anexos ?? []) as Json[]).map((a) => (typeof a === 'string' ? a : a?.anexo));
  const externas = ((p.imagens_externas ?? []) as Json[]).map((i) =>
    typeof i === 'string' ? i : (i?.imagem_externa?.url ?? i?.url),
  );
  const fotos = [...anexos, ...externas].filter((u): u is string => typeof u === 'string' && ehImagem(u));

  const texto = (v: unknown) => String(v ?? '').trim() || null;
  return {
    ean,
    status: 'ok',
    produto: {
      tiny_id: String(p.id),
      nome,
      marca: texto(p.marca),
      fornecedor: texto(p.nome_fornecedor),
      categoria: texto(p.categoria),
      fotos,
      situacao: String(p.situacao ?? ''), // A = ativo, I = inativo (no Tiny = não vende online)
    },
  };
}

/** Prefere o EAN no GTIN e produto comum/variação, não o "pai" das variações. */
function peso(p: Json, ean: string): number {
  return (p.gtin === ean ? 0 : 1) + (p.tipoVariacao === 'P' ? 2 : 0) + (p.situacao === 'A' ? 0 : 4);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erro: 'Use POST.' }, 405);

  // só admin: o mesmo critério do banco (app_metadata.role = 'admin')
  const auth = req.headers.get('Authorization') ?? '';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  });
  const { data } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
  if (data.user?.app_metadata?.role !== 'admin') {
    return json({ erro: 'Só administradores podem sincronizar com o Tiny.' }, 403);
  }

  let eans: string[];
  try {
    const corpo = await req.json();
    eans = [...new Set((corpo?.eans ?? []) as unknown[])].map((e) => String(e).trim());
  } catch {
    return json({ erro: 'Corpo inválido: mande { "eans": [...] }.' }, 400);
  }
  if (!eans.length || eans.length > MAX_EANS || eans.some((e) => !/^\d{6,14}$/.test(e))) {
    return json({ erro: `Mande de 1 a ${MAX_EANS} códigos de barras (só números, 6 a 14 dígitos).` }, 400);
  }

  const resultados: Json[] = [];
  for (let i = 0; i < eans.length; i++) {
    const ean = eans[i]!;
    try {
      resultados.push(await buscar(ean));
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      // token errado ou limite estourado: os próximos falhariam igual
      if (e instanceof ErroTiny && (e.codigo === TOKEN_INVALIDO || e.codigo === BLOQUEADO)) {
        const aviso = e.codigo === BLOQUEADO
          ? 'O Tiny bloqueou por excesso de acessos — espere 1 minuto e tente de novo.'
          : 'O token do Tiny foi recusado — confira o segredo TINY_TOKEN no Supabase.';
        for (const resto of eans.slice(i)) resultados.push({ ean: resto, status: 'erro', erro: aviso });
        break;
      }
      resultados.push({ ean, status: 'erro', erro });
    }
  }
  return json({ resultados });
});
