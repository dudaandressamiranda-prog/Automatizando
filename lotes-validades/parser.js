/*
 * Interpreta o texto lido pela câmera (OCR) e separa o LOTE e a VALIDADE.
 *
 * Funciona no navegador (expõe `window.LoteParser`) e no Node (para os
 * testes em test/parser.test.js).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LoteParser = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MESES = {
    JAN: 1, FEV: 2, FEB: 2, MAR: 3, ABR: 4, APR: 4, MAI: 5, MAY: 5,
    JUN: 6, JUL: 7, AGO: 8, AUG: 8, SET: 9, SEP: 9, OUT: 10, OCT: 10,
    NOV: 11, DEZ: 12, DEC: 12,
  };
  const MES_NOMES = Object.keys(MESES).join("|");

  // Palavras que indicam que a data a seguir é a validade / a fabricação.
  const KW_VALIDADE = /(?:^|[^A-Z])(VALIDADE|VALID|VAL|VENCIMENTO|VENC|VCTO|VTO|EXPIRY|EXPIRA|EXP|USE ATE|CONSUMIR ATE|BEST BEFORE|BB|V)\s*[:.\-]?\s*$/;
  const KW_FABRICACAO = /(?:^|[^A-Z])(FABRICACAO|FABRICADO|FABR|FAB|MFG|MFD|PRODUCAO|PROD|DATA FAB|F)\s*[:.\-]?\s*$/;
  // Palavras que encerram o código do lote quando o OCR "cola" tudo.
  const CORTE_LOTE = /(VALIDADE|VAL|VENC|VCTO|EXP|FAB|MFG|MFD|PROD|DATA)/;

  /** Maiúsculas, sem acentos e sem caracteres estranhos do OCR. */
  function normalizar(texto) {
    return String(texto || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[|¦]/g, "I")
      .replace(/[‘’`´]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, "-")
      .replace(/[\t ]+/g, " ");
  }

  /** Corrige letras que o OCR confunde com números dentro de datas (O→0, I→1, S→5...). */
  function corrigirDigitosEmDatas(texto) {
    const mapa = { O: "0", Q: "0", D: "0", I: "1", L: "1", S: "5", B: "8", Z: "2", G: "6" };
    return texto.replace(
      /(^|[^A-Z0-9])([0-9OQDILSBZG]{1,4}(?: ?[\/.\-] ?[0-9OQDILSBZG]{1,4}){1,2})(?=$|[^A-Z0-9])/g,
      (m, antes, bloco) => {
        const digitos = (bloco.match(/[0-9]/g) || []).length;
        if (digitos < 2) return m;
        return antes + bloco.replace(/[OQDILSBZG]/g, (c) => mapa[c]);
      }
    );
  }

  function ano4(a) {
    const n = parseInt(a, 10);
    return a.length <= 2 ? 2000 + n : n;
  }

  function ultimoDiaDoMes(ano, mes) {
    return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function montarData(dia, mes, ano) {
    if (!(mes >= 1 && mes <= 12)) return null;
    if (!(ano >= 2000 && ano <= 2099)) return null;
    if (dia != null) {
      if (!(dia >= 1 && dia <= ultimoDiaDoMes(ano, mes))) return null;
      return { texto: `${pad(dia)}/${pad(mes)}/${ano}`, iso: `${ano}-${pad(mes)}-${pad(dia)}`, temDia: true };
    }
    // Só mês/ano: vale até o último dia do mês.
    return {
      texto: `${pad(mes)}/${ano}`,
      iso: `${ano}-${pad(mes)}-${pad(ultimoDiaDoMes(ano, mes))}`,
      temDia: false,
    };
  }

  /** Encontra todas as datas do texto, com a posição de cada uma. */
  function encontrarDatas(texto) {
    const datas = [];
    const ocupado = new Array(texto.length).fill(false);
    const padroes = [
      // 15/03/2027 · 15.03.27 · 15-03-2027
      {
        re: /(?<![0-9])(\d{1,2}) ?[\/.\-] ?(\d{1,2}) ?[\/.\-] ?(\d{4}|\d{2})(?![0-9])/g,
        fn: (m) => montarData(+m[1], +m[2], ano4(m[3])),
      },
      // 15 MAR 2027 · 15/MAR/27
      {
        re: new RegExp(`(?<![0-9])(\\d{1,2}) ?[\\/.\\-]? ?(${MES_NOMES}) ?[\\/.\\-]? ?(\\d{4}|\\d{2})(?![0-9])`, "g"),
        fn: (m) => montarData(+m[1], MESES[m[2]], ano4(m[3])),
      },
      // MAR/2027 · MAR 27
      {
        re: new RegExp(`(?<![A-Z])(${MES_NOMES}) ?[\\/.\\-]? ?(\\d{4}|\\d{2})(?![0-9])`, "g"),
        fn: (m) => montarData(null, MESES[m[1]], ano4(m[2])),
      },
      // 03/2027 · 03-27 · 3.2027
      {
        re: /(?<![0-9\/.\-])(\d{1,2}) ?[\/.\-] ?(\d{4}|\d{2})(?![0-9])/g,
        fn: (m) => montarData(null, +m[1], ano4(m[2])),
      },
      // 032027 ou 2027-03 são raros; não tentamos adivinhar números soltos.
    ];

    for (const { re, fn } of padroes) {
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(texto))) {
        const ini = m.index;
        const fim = ini + m[0].length;
        let livre = true;
        for (let i = ini; i < fim; i++) if (ocupado[i]) { livre = false; break; }
        if (!livre) continue;
        const data = fn(m);
        if (!data) continue;
        for (let i = ini; i < fim; i++) ocupado[i] = true;
        datas.push({ ...data, inicio: ini, fim });
      }
    }
    return datas.sort((a, b) => a.inicio - b.inicio);
  }

  /** Olha o texto logo antes da data para saber se é validade ou fabricação. */
  function classificar(texto, data, anterior) {
    const desde = anterior ? anterior.fim : 0;
    const antes = texto.slice(Math.max(desde, data.inicio - 30), data.inicio).replace(/\n/g, " ").trimEnd();
    if (KW_VALIDADE.test(antes)) return "validade";
    if (KW_FABRICACAO.test(antes)) return "fabricacao";
    // Palavra-chave um pouco mais longe (ex.: "VAL. 12/2027" com lixo do OCR no meio).
    if (/(VALIDADE|VENC|EXP|VAL)/.test(antes) && !/(FAB|MFG|PROD)/.test(antes)) return "validade";
    if (/(FAB|MFG|MFD|PROD)/.test(antes)) return "fabricacao";
    return "desconhecida";
  }

  /** Extrai a validade do texto do OCR. Retorna {texto, iso} ou null. */
  function extrairValidade(textoOcr) {
    const texto = corrigirDigitosEmDatas(normalizar(textoOcr));
    const datas = encontrarDatas(texto);
    if (!datas.length) return null;
    datas.forEach((d, i) => (d.tipo = classificar(texto, d, datas[i - 1])));

    const marcada = datas.find((d) => d.tipo === "validade");
    const escolhida =
      marcada ||
      // Sem palavra-chave: a validade é a data mais distante (fabricação vem antes).
      datas
        .filter((d) => d.tipo !== "fabricacao")
        .sort((a, b) => b.iso.localeCompare(a.iso))[0] ||
      null;
    return escolhida ? { texto: escolhida.texto, iso: escolhida.iso } : null;
  }

  /** Extrai o código do lote do texto do OCR. Retorna string ou null. */
  function extrairLote(textoOcr) {
    const texto = normalizar(textoOcr);
    const padroes = [
      // LOTE: AB1234 · LOT AB1234 · LT.AB1234 · LOTE Nº 123
      /(?:^|[^A-Z])(?:LOTE|LOT|LT)\s*(?:N\s?[O°º.]?\s*)?[:.\-#]?\s*([A-Z0-9][A-Z0-9\-\/]{1,24})/,
      // L: AB1234 · L.1234 · L1234
      /(?:^|[^A-Z0-9])L\s*[:.\-#]\s*([A-Z0-9][A-Z0-9\-\/]{1,24})/,
      /(?:^|[^A-Z0-9])L(\d[A-Z0-9\-\/]{2,24})/,
    ];
    for (const re of padroes) {
      const linhas = texto.split("\n");
      for (const linha of linhas) {
        const m = linha.match(re);
        if (!m) continue;
        let valor = m[1];
        const corte = valor.slice(1).search(CORTE_LOTE);
        if (corte >= 0) valor = valor.slice(0, corte + 1);
        valor = valor.replace(/[\-\/.]+$/, "");
        if (valor.length < 2 || !/\d/.test(valor)) continue;
        // Não confundir uma data com lote (ex.: "L 12/2027" mal lido).
        if (/^\d{1,2}[\/\-]\d{2,4}([\/\-]\d{2,4})?$/.test(valor)) continue;
        return valor;
      }
    }
    return null;
  }

  /** Lê o texto inteiro do OCR e devolve {lote, validade}. */
  function interpretar(textoOcr) {
    return { lote: extrairLote(textoOcr), validade: extrairValidade(textoOcr) };
  }

  /**
   * Interpreta uma validade digitada à mão (dd/mm/aaaa, mm/aaaa, MAR/2027...).
   * Retorna {texto, iso} ou null.
   */
  function lerDataDigitada(valor) {
    const texto = corrigirDigitosEmDatas(normalizar(valor).trim());
    const datas = encontrarDatas(texto);
    if (datas.length !== 1) return null;
    return { texto: datas[0].texto, iso: datas[0].iso };
  }

  /**
   * Lê códigos GS1 (DataMatrix de medicamentos, GS1-128), que já trazem
   * GTIN (01), validade (17) e lote (10) dentro do próprio código.
   * Aceita o formato cru (separador FNC1 = \x1d) ou com parênteses.
   * Retorna {gtin, lote, validade} ou null se não for GS1.
   */
  function lerGs1(codigo) {
    let s = String(codigo || "").trim();
    s = s.replace(/^\](d2|C1|Q3|e0)/, "").replace(/^\x1d/, "");
    if (/^\(\d{2,4}\)/.test(s)) {
      // (01)07891234567895(17)270331(10)AB123 → formato cru com separadores
      s = s.replace(/\((\d{2,4})\)/g, "\x1d$1").replace(/^\x1d/, "");
    }
    // Um EAN/UPC comum (só dígitos, até 14) não é GS1, mesmo começando com "01".
    if (/^\d{1,14}$/.test(s) || !/^(01|02|10|11|17|21)/.test(s)) return null;

    const fixos = { "00": 18, "01": 14, "02": 14, "11": 6, "12": 6, "13": 6, "15": 6, "16": 6, "17": 6, "20": 2 };
    const variaveis = ["10", "21", "22", "30", "37", "90", "91", "92", "93", "94", "95", "96", "97", "98", "99"];
    const campos = {};
    let i = 0;
    while (i < s.length) {
      if (s[i] === "\x1d") { i++; continue; }
      const ai = s.slice(i, i + 2);
      if (fixos[ai]) {
        campos[ai] = s.slice(i + 2, i + 2 + fixos[ai]);
        i += 2 + fixos[ai];
      } else if (variaveis.includes(ai)) {
        const fim = s.indexOf("\x1d", i + 2);
        campos[ai] = s.slice(i + 2, fim < 0 ? s.length : fim);
        i = fim < 0 ? s.length : fim + 1;
      } else if (/^24[01]$/.test(s.slice(i, i + 3))) {
        const fim = s.indexOf("\x1d", i + 3);
        i = fim < 0 ? s.length : fim + 1;
      } else {
        break;
      }
    }
    const gtin = campos["01"] || campos["02"];
    if (!gtin || !/^\d{14}$/.test(gtin)) return null;

    let validade = null;
    const v = campos["17"];
    if (v && /^\d{6}$/.test(v)) {
      const ano = 2000 + +v.slice(0, 2);
      const mes = +v.slice(2, 4);
      const dia = +v.slice(4, 6);
      const d = montarData(dia === 0 ? null : dia, mes, ano);
      if (d) validade = { texto: d.texto, iso: d.iso };
    }
    return { gtin, lote: campos["10"] || null, validade };
  }

  /** GTIN-14 com zero à esquerda vira o EAN-13 que está na caixa. */
  function gtinParaEan(gtin) {
    return /^0\d{13}$/.test(gtin) ? gtin.slice(1) : gtin;
  }

  return { interpretar, extrairLote, extrairValidade, lerDataDigitada, lerGs1, gtinParaEan, normalizar };
});
