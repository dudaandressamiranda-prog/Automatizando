/**
 * Chave de acesso da NF-e — os 44 dígitos impressos no rodapé do DANFE.
 *
 * A chave não é um número solto: ela carrega estado, mês de emissão, CNPJ
 * do emitente, série e número da nota, tudo em posições fixas. Dá para
 * conferir se foi digitada certa (dígito verificador módulo 11) e mostrar
 * de que nota se trata antes de qualquer consulta externa.
 */

const UFS: Record<string, string> = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
  '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL',
  '28': 'SE', '29': 'BA', '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP', '41': 'PR',
  '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF',
};

export interface ChaveNfe {
  chave: string;
  uf: string;
  emissao: string; // AAAA-MM
  cnpjEmitente: string;
  modelo: string;
  serie: string;
  numero: string;
}

/** Só os dígitos — a chave costuma vir com espaços a cada 4 caracteres. */
export function limpaChave(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** Dígito verificador da chave: módulo 11 com pesos 2 a 9, da direita para a esquerda. */
export function dvChave(corpo43: string): number {
  const pesos = [2, 3, 4, 5, 6, 7, 8, 9];
  let soma = 0;
  for (let i = 0; i < 43; i++) {
    const d = Number(corpo43[42 - i]);
    soma += d * pesos[i % 8]!;
  }
  const resto = soma % 11;
  return resto === 0 || resto === 1 ? 0 : 11 - resto;
}

export function chaveValida(raw: string): boolean {
  const c = limpaChave(raw);
  if (!/^\d{44}$/.test(c)) return false;
  return dvChave(c.slice(0, 43)) === Number(c[43]);
}

/** Formata CNPJ para leitura: 01.770.356/0001-77 */
export function formataCnpj(cnpj: string): string {
  if (cnpj.length !== 14) return cnpj;
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

/** Lê a chave. Devolve null quando os 44 dígitos ou o verificador não batem. */
export function lerChave(raw: string): ChaveNfe | null {
  const c = limpaChave(raw);
  if (!chaveValida(c)) return null;
  return {
    chave: c,
    uf: UFS[c.slice(0, 2)] ?? c.slice(0, 2),
    emissao: `20${c.slice(2, 4)}-${c.slice(4, 6)}`,
    cnpjEmitente: c.slice(6, 20),
    modelo: c.slice(20, 22),
    serie: String(Number(c.slice(22, 25))),
    numero: String(Number(c.slice(25, 34))),
  };
}

/** Agrupa de 4 em 4, como aparece impresso no DANFE. */
export function formataChave(raw: string): string {
  return (limpaChave(raw).match(/.{1,4}/g) ?? []).join(' ');
}
