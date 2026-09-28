# Controle do Consultório — Loja Centro

App (um único arquivo `index.html`) para controlar **vacinas, injetáveis de
geladeira e insumos** do consultório: entrada, saída, descarte, lotes/validade
e as contagens diárias da geladeira com temperatura.

## Como usar

1. Baixe `index.html` e abra no navegador (Chrome/Edge/Safari) — no computador
   ou no celular. Também funciona hospedado (GitHub Pages, Netlify…).
2. Entre com o **mesmo e-mail e senha do Consulveter Estoque**.
   - Os produtos são lidos direto do cadastro do Consulveter (só nome, código de
     barras, categoria e unidade — estoque e preço do Consulveter **não** são
     usados nem alterados).
   - Membros da equipe já vinculados à conta no Consulveter veem os mesmos dados.
3. **Uma única vez**, crie as tabelas do consultório: no painel do Supabase do
   Consulveter → *SQL Editor* → cole o conteúdo de `supabase.sql` → *Run*.
   (O app avisa se isso ainda não foi feito.)
4. Em ⚙️ Configurações, cada aparelho informa o nome de quem está usando.
5. Em 📦 Itens → *+ Adicionar itens*, busque os produtos do Consulveter, marque
   os que ficam no consultório e escolha **Geladeira** ou **Insumo**.
6. Lance o saldo inicial de cada item em 🔄 Entrada (motivo "Saldo inicial"),
   com lote e validade.

Sem login também funciona ("Usar sem login"), mas aí os dados ficam só naquele
navegador — bom para testar.

## O que mudou em relação à planilha

| Planilha | App |
|---|---|
| Linhas SAÍDA/ENTRADA preenchidas no fim de cada contagem | Cada saída/entrada é lançada na hora (com lote, motivo, paciente/tutor e responsável). A contagem mostra automaticamente o que foi lançado desde a anterior. |
| Contar e escrever a quantidade de tudo, 3× por dia | O sistema já sabe quanto deveria ter. Na contagem você digita o que contou (ou toca ✓ quando bate) e **só as divergências ficam em vermelho**, exigindo justificativa. |
| DIFERENÇA calculada de cabeça | Diferença calculada sozinha; opção de corrigir o estoque com um ajuste registrado no histórico. |
| Sem controle de validade | Lotes com validade, saída "vence primeiro, sai primeiro" automática, alertas de vencidos/vencendo e botão de descarte. |
| — | Registro de temperatura da geladeira (atual/mín/máx) com alerta fora de 2–8 °C. |
| Uma aba por mês | 📅 Diário monta a "planilha" de qualquer dia (início, entradas, saídas, cada contagem, fim) — imprimível e exportável em CSV. |

## Telas

- **Painel** — contagens do dia (feitas/pendentes/atrasadas), vencidos, vencendo,
  abaixo do mínimo, última temperatura e o saldo atual da geladeira.
- **Contagem** — 1ª/2ª/3ª contagem (nomes e horários configuráveis).
- **Entrada / Saída** — entrada (lote + validade + NF), saída, descarte e ajuste;
  aceita leitor de código de barras no campo de busca.
- **Validades** — lotes com saldo, ordenados pelo vencimento.
- **Diário**, **Histórico** (lançamentos e contagens, CSV) e **Itens**
  (inclui exportar a lista de nomes de produtos do Consulveter em CSV).

## Como os dados ficam guardados

Tabelas novas no mesmo Supabase do Consulveter (`cc_itens`, `cc_lotes`,
`cc_movs`, `cc_contagens`), protegidas pelas mesmas regras de acesso da conta.
O saldo não é um número gravado: é a soma das movimentações. Assim duas pessoas
lançando ao mesmo tempo nunca apagam o lançamento uma da outra, e todo saldo
tem histórico que explica de onde veio.
