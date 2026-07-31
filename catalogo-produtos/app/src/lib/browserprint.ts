/**
 * Zebra Browser Print — o programinha da Zebra que roda na máquina e deixa
 * o navegador falar direto com a impressora.
 *
 * Quando está instalado, o ZPL vai direto para a Zebra e o código de barras
 * é desenhado pela impressora, que é o jeito de melhor qualidade. Quando não
 * está, o app cai na impressão normal do navegador — por isso tudo aqui
 * falha em silêncio, sem atrapalhar quem não tem o programa.
 *
 * A porta 9101 (https) existe justamente para páginas servidas em https,
 * como esta: chamar http://localhost de uma página segura é bloqueado.
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

async function tenta<T>(caminho: string, init?: RequestInit): Promise<T | null> {
  for (const base of ENDERECOS) {
    try {
      const res = await fetch(base + caminho, { ...init, signal: AbortSignal.timeout(2500) });
      if (res.ok) return (await res.json().catch(() => ({}))) as T;
    } catch {
      // porta fechada, programa não instalado, certificado recusado — segue
    }
  }
  return null;
}

/** Impressoras que o Browser Print enxerga. Lista vazia = não disponível. */
export async function listarImpressoras(): Promise<Impressora[]> {
  const r = await tenta<{ printer?: Impressora[] }>('/available');
  return r?.printer ?? [];
}

/** Manda o ZPL para a impressora. Devolve false se não conseguiu falar com ela. */
export async function imprimirZpl(impressora: Impressora, zpl: string): Promise<boolean> {
  for (const base of ENDERECOS) {
    try {
      const res = await fetch(base + '/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device: impressora, data: zpl }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return true;
    } catch {
      // tenta o próximo endereço
    }
  }
  return false;
}
