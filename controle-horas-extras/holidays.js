// holidays.js
// Cálculo de feriados nacionais (Brasil) e municipais de Contagem/MG,
// mais um repositório de feriados personalizados (localStorage) para
// ajustes finos, já que decretos municipais mudam ano a ano.

const HORAS_EXTRAS_TIPOS_FERIADO = {
  NACIONAL: 'nacional',
  FACULTATIVO: 'facultativo', // ponto facultativo / não é folga obrigatória em todo lugar
  MUNICIPAL: 'municipal',
  PERSONALIZADO: 'personalizado',
};

// Algoritmo de Gauss/Meeus para a data da Páscoa (calendário gregoriano).
function calcularPascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31); // 3 = março, 4 = abril
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

function somarDias(data, dias) {
  const d = new Date(data);
  d.setDate(d.getDate() + dias);
  return d;
}

function formatarChaveData(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

// Monta a lista de feriados/pontos facultativos de um ano específico.
function feriadosDoAno(ano) {
  const T = HORAS_EXTRAS_TIPOS_FERIADO;
  const pascoa = calcularPascoa(ano);
  const carnavalTerca = somarDias(pascoa, -47);
  const carnavalSegunda = somarDias(pascoa, -48);
  const sextaSanta = somarDias(pascoa, -2);
  const corpusChristi = somarDias(pascoa, 60);
  // Sexta-feira de Dores: sexta-feira anterior ao Domingo de Ramos
  // (Domingo de Ramos = Páscoa - 7 dias; a sexta-feira anterior a ele
  // é Páscoa - 9 dias), celebrada em Contagem como Jubileu de Nossa
  // Senhora das Dores (padroeira do município, Lei Municipal nº 3.484/2001).
  const sextaDeDores = somarDias(pascoa, -9);

  return [
    // --- Feriados nacionais ---
    { data: new Date(ano, 0, 1), nome: 'Confraternização Universal', tipo: T.NACIONAL },
    { data: sextaSanta, nome: 'Sexta-feira Santa', tipo: T.NACIONAL },
    { data: new Date(ano, 3, 21), nome: 'Tiradentes', tipo: T.NACIONAL },
    { data: new Date(ano, 4, 1), nome: 'Dia do Trabalho', tipo: T.NACIONAL },
    { data: new Date(ano, 8, 7), nome: 'Independência do Brasil', tipo: T.NACIONAL },
    { data: new Date(ano, 9, 12), nome: 'Nossa Senhora Aparecida', tipo: T.NACIONAL },
    { data: new Date(ano, 10, 2), nome: 'Finados', tipo: T.NACIONAL },
    { data: new Date(ano, 10, 15), nome: 'Proclamação da República', tipo: T.NACIONAL },
    { data: new Date(ano, 10, 20), nome: 'Dia Nacional de Zumbi e da Consciência Negra', tipo: T.NACIONAL },
    { data: new Date(ano, 11, 25), nome: 'Natal', tipo: T.NACIONAL },
    // --- Pontos facultativos de abrangência nacional (não são folga
    //     obrigatória por lei federal, mas muitas empresas observam) ---
    { data: carnavalSegunda, nome: 'Carnaval (segunda-feira)', tipo: T.FACULTATIVO },
    { data: carnavalTerca, nome: 'Carnaval (terça-feira)', tipo: T.FACULTATIVO },
    { data: corpusChristi, nome: 'Corpus Christi', tipo: T.FACULTATIVO },
    // --- Municipais de Contagem/MG ---
    { data: sextaDeDores, nome: 'Jubileu de Nossa Senhora das Dores (padroeira de Contagem)', tipo: T.MUNICIPAL },
    { data: new Date(ano, 11, 8), nome: 'Nossa Senhora da Conceição (Contagem)', tipo: T.MUNICIPAL },
    { data: new Date(ano, 7, 30), nome: 'Aniversário de Contagem', tipo: T.FACULTATIVO },
  ];
}

const _cacheFeriados = new Map();

// Retorna um Map de 'AAAA-MM-DD' -> { nome, tipo } com feriados oficiais
// (nacionais + municipais de Contagem) já mesclados aos personalizados
// salvos pela usuária em Configurações.
function obterFeriados(ano) {
  if (!_cacheFeriados.has(ano)) {
    const mapa = new Map();
    for (const item of feriadosDoAno(ano)) {
      mapa.set(formatarChaveData(item.data), { nome: item.nome, tipo: item.tipo });
    }
    _cacheFeriados.set(ano, mapa);
  }

  const mapaBase = _cacheFeriados.get(ano);
  const personalizados = carregarFeriadosPersonalizados();
  if (personalizados.length === 0) return mapaBase;

  const mapaFinal = new Map(mapaBase);
  for (const fp of personalizados) {
    // fp.data pode ser 'AAAA-MM-DD' (data única) ou 'MM-DD' (repete todo ano)
    let chave = fp.data;
    if (/^\d{2}-\d{2}$/.test(fp.data)) {
      chave = `${ano}-${fp.data}`;
    } else if (!fp.data.startsWith(String(ano))) {
      continue;
    }
    mapaFinal.set(chave, { nome: fp.nome, tipo: HORAS_EXTRAS_TIPOS_FERIADO.PERSONALIZADO });
  }
  return mapaFinal;
}

const CHAVE_FERIADOS_PERSONALIZADOS = 'horasExtras.feriadosCustom.v1';

function carregarFeriadosPersonalizados() {
  try {
    const bruto = localStorage.getItem(CHAVE_FERIADOS_PERSONALIZADOS);
    return bruto ? JSON.parse(bruto) : [];
  } catch (e) {
    return [];
  }
}

function salvarFeriadosPersonalizados(lista) {
  localStorage.setItem(CHAVE_FERIADOS_PERSONALIZADOS, JSON.stringify(lista));
}
