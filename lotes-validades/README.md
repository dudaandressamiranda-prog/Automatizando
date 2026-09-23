# Lotes e Validades

App para celular (PWA, sem backend) que registra **lote** e **validade** dos
produtos usando a câmera: bipa o código de barras, a câmera já abre
apontada para a embalagem e o app **transcreve** o lote e a validade em
texto. Nenhuma foto é guardada, só os dados escritos.

## Como usar

1. Abra `https://dudaandressamiranda-prog.github.io/Automatizando/lotes-validades/`
   no celular (Chrome no Android ou Safari no iPhone). A câmera só funciona
   em endereço **https**.
2. Opcional: no menu do navegador, toque em **Adicionar à tela inicial**
   para ter o ícone do app.
3. Toque em **Bipar código de barras** e aponte para o código do produto.
   Também dá para digitar o código ou usar um leitor USB/Bluetooth no
   campo logo abaixo (ele "digita" o código e aperta Enter).
4. Assim que o código é lido, abre a tela do lote com a **câmera já
   ligada**. Mire a moldura azul no lote e na validade impressos na
   embalagem.
5. O app lê o texto várias vezes por segundo. Quando a mesma leitura se
   repete, o campo fica verde (**✓ lido**) e o celular vibra.
6. Confira os campos (dá para corrigir digitando) e toque em **Salvar**
   ou em **Salvar e bipar o próximo** para continuar a conferência sem
   voltar para a lista.

Na lista, os registros ficam ordenados pela validade:
🔴 vencido · 🟡 vence em até 30 dias · 🟢 no prazo. Toque num registro para
editar ou excluir.

### O que o app entende na embalagem

- **Lote**: `LOTE`, `LOT`, `LT`, `L:` / `L.` / `L1234`.
- **Validade**: `VAL`, `VALIDADE`, `VENC`, `VCTO`, `EXP`, `V:`. Formatos
  `dd/mm/aaaa`, `dd.mm.aa`, `mm/aaaa`, `MAR/2027`, `15 MAR 2027`…
- A data de **fabricação** (`FAB`, `MFG`, `F:`) é ignorada. Se não houver
  palavra-chave, a validade é a data mais distante.
- Corrige confusões comuns do OCR dentro das datas (`O`→`0`, `I`→`1`,
  `S`→`5`…).
- **DataMatrix / GS1** (o quadradinho de medicamentos): o lote e a
  validade já vêm dentro do código e o app preenche sem precisar do OCR.

### Menu ⚙️

- **Exportar planilha (CSV)**: gera um CSV (abre no Excel) com código,
  produto, lote, validade e situação, para compartilhar ou baixar.
- **Importar lista de produtos**: um CSV com `código;descrição` por linha
  (pode ser exportado do sistema da loja). Com ele, o nome do produto
  aparece sozinho ao bipar. Sem a lista, o app lembra o nome que você
  digitar na primeira vez para aquele código.
- **Apagar todos os registros**.

Os dados ficam salvos só no próprio celular (`localStorage`). Exporte a
planilha para guardar ou enviar.

## Limitações

- O reconhecimento de texto (Tesseract.js) roda **no celular**. Na
  primeira vez ele baixa uns ~7 MB; depois disso fica em cache.
- Impressão a jato de tinta (a de pontinhos), embalagens brilhantes ou
  curvas e pouca luz atrapalham a leitura. Use a lanterna 🔦 (aparece
  quando o aparelho permite), aproxime até o texto ocupar boa parte da
  moldura e mantenha o celular parado. Se não sair, digite; o que é
  digitado nunca é sobrescrito pela câmera.
- No iPhone o código de barras é lido pela biblioteca ZXing (o Safari não
  tem o leitor nativo do Chrome/Android), o que pode ser um pouco mais
  lento.

## Desenvolvimento

- `parser.js`: regras que separam lote e validade do texto lido (e o
  leitor de GS1).
- `app.js`: telas, câmera, leitor de código de barras e OCR.
- Testes do parser: `node --test lotes-validades/test/*.test.js`.
