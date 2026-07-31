/**
 * Zebra Browser Print — o programinha da Zebra que roda na máquina e deixa
 * o navegador falar direto com a impressora.
 *
 * Quando está instalado, o ZPL vai direto para a Zebra e o código de barras
 * é desenhado pela impressora, que é o jeito de melhor qualidade — e a
 * etiqueta sai sem passar pela janela de impressão.
 *
 * A porta 9101 (https) existe justamente para páginas servidas em https,
 * como esta: chamar http://localhost de uma página segura é bloqueado pelo
 * navegador. Por isso ela é tentada primeiro.
 */

const ENDERECOS = ['https://localhost:9101', 'http://localhost:9100'];

export interface Impressora {
  name: string;
  uid: string;
  connection: string;
  deviceType: string;
  provider: string;
  manufacturer?: string;
}

/**
 * Por que a busca falhou. Serve para a tela dizer o que fazer em vez de
 * só sumir com o botão: "não achei o programa" e "achei o programa mas
 * nenhuma impressora" pedem soluções bem diferentes.
 */
export type Diagnostico =
  | { estado: 'ok'; impressoras: Impressora[]; porta: string }
  | { estado: 'sem-programa'; detalhe: string }
  | { estado: 'sem-impressora'; porta: string };

async function buscar(base: string): Promise<{ ok: boolean; corpo?: unknown; erro?: string }> {
  try {
    const res = await fetch(`${base}/available`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { ok: false, erro: `respondeu ${res.status}` };
    return { ok: true, corpo: await res.json().catch(() => null) };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.name : 'falhou' };
  }
}

/** Aceita os formatos que o Browser Print já usou entre versões. */
function extrair(corpo: unknown): Impressora[] {
  if (!corpo) return [];
  if (Array.isArray(corpo)) return corpo as Impressora[];
  const o = corpo as { printer?: Impressora[]; device?: Impressora[]; usb?: Impressora[] };
  return o.printer ?? o.device ?? o.usb ?? [];
}

export async function diagnosticar(): Promise<Diagnostico> {
  const falhas: string[] = [];
  for (const base of ENDERECOS) {
    const r = await buscar(base);
    if (!r.ok) {
      falhas.push(`${base}: ${r.erro}`);
      continue;
    }
    const impressoras = extrair(r.corpo);
    if (impressoras.length === 0) return { estado: 'sem-impressora', porta: base };
    return { estado: 'ok', impressoras, porta: base };
  }
  return { estado: 'sem-programa', detalhe: falhas.join(' · ') };
}

/** Lista simples, para quem só quer saber se dá para imprimir. */
export async function listarImpressoras(): Promise<Impressora[]> {
  const d = await diagnosticar();
  return d.estado === 'ok' ? d.impressoras : [];
}

/** Manda o ZPL para a impressora. Devolve o erro em texto quando não vai. */
export async function imprimirZpl(
  impressora: Impressora,
  zpl: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const falhas: string[] = [];
  for (const base of ENDERECOS) {
    try {
      const res = await fetch(`${base}/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device: impressora, data: zpl }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) return { ok: true };
      falhas.push(`${base}: ${res.status}`);
    } catch (e) {
      falhas.push(`${base}: ${e instanceof Error ? e.name : 'falhou'}`);
    }
  }
  return { ok: false, erro: falhas.join(' · ') };
}
