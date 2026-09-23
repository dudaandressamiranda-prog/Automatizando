// Rode com: node --test lotes-validades/test/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { interpretar, lerDataDigitada } = require("../parser.js");

function caso(texto, lote, validade) {
  const r = interpretar(texto);
  assert.equal(r.lote, lote, `lote de ${JSON.stringify(texto)}`);
  assert.equal(r.validade && r.validade.texto, validade, `validade de ${JSON.stringify(texto)}`);
}

test("etiqueta completa com palavras-chave", () => {
  caso("LOTE: AB1234\nFAB: 01/02/2025\nVAL: 01/02/2027", "AB1234", "01/02/2027");
  caso("Lote 23K0456\nFabricação 10/2025\nValidade 10/2027", "23K0456", "10/2027");
  caso("L: 4521B  VAL: 03/2027", "4521B", "03/2027");
  caso("LOT 7788-A EXP 2027-? 12/27", "7788-A", "12/2027");
});

test("validade antes da fabricação e abreviações", () => {
  caso("VENC. 15.08.26 FAB. 15.08.24 LT 99812", "99812", "15/08/2026");
  caso("V: 05/2028 F: 05/2026 L: X12Y", "X12Y", "05/2028");
});

test("sem palavra-chave de validade: pega a data mais distante", () => {
  caso("L230915\n15/09/2023\n15/09/2025", "230915", "15/09/2025");
});

test("fabricação sozinha não vira validade", () => {
  caso("FAB 01/2026 LOTE 123", "123", null);
});

test("meses por extenso", () => {
  caso("LOTE A1B2 VAL MAR/2027", "A1B2", "03/2027");
  caso("EXP 12 DEZ 2026 LOT Q55", "Q55", "12/12/2026");
});

test("corrige letras confundidas pelo OCR em datas", () => {
  caso("LOTE 5566 VAL: O1/1O/2O27", "5566", "01/10/2027");
  caso("LOTE 5566 VAL: 3I/12/2026", "5566", "31/12/2026");
});

test("texto colado pelo OCR", () => {
  caso("L2345VAL03/2027", "2345", "03/2027");
});

test("datas inválidas são ignoradas", () => {
  caso("LOTE 12 VAL 45/13/2027", "12", null);
});

test("não confunde palavras com lote", () => {
  caso("LOTE\nVAL 06/2027", null, "06/2027");
  caso("Produto veterinário uso oral", null, null);
});

test("validade digitada à mão", () => {
  assert.deepEqual(lerDataDigitada("5/3/27"), { texto: "05/03/2027", iso: "2027-03-05" });
  assert.deepEqual(lerDataDigitada("02/2028"), { texto: "02/2028", iso: "2028-02-29" });
  assert.deepEqual(lerDataDigitada("abr 2027"), { texto: "04/2027", iso: "2027-04-30" });
  assert.equal(lerDataDigitada("31/02/2027"), null);
  assert.equal(lerDataDigitada("amanhã"), null);
});

test("códigos GS1 (DataMatrix / GS1-128) já trazem lote e validade", () => {
  const { lerGs1, gtinParaEan } = require("../parser.js");
  const cru = lerGs1("0107891234567895172703311" + "0AB-123\x1d21SERIAL9");
  assert.deepEqual(cru, { gtin: "07891234567895", lote: "AB-123", validade: { texto: "31/03/2027", iso: "2027-03-31" } });
  assert.equal(gtinParaEan(cru.gtin), "7891234567895");

  const parenteses = lerGs1("(01)07891234567895(17)280600(10)L55");
  assert.equal(parenteses.lote, "L55");
  assert.deepEqual(parenteses.validade, { texto: "06/2028", iso: "2028-06-30" });

  assert.equal(lerGs1("7891234567895"), null);
  assert.equal(lerGs1("0123456789012"), null);
});
