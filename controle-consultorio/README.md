# Controle do Consultório — Loja Centro

App (um único arquivo `index.html`) para controlar **vacinas, injetáveis de
geladeira e insumos** do consultório: entrada, saída, descarte, lotes/validade
e as contagens diárias do consultório (vacinas, injetáveis de geladeira,
testes e o que mais precisar ser contado).

## Novo: escolher quais itens têm validade controlada

Nem tudo precisa de lote e vencimento (gaze, esparadrapo, luva...). Ao
adicionar itens ou editar um já cadastrado, dá para desmarcar **"Controlar
validade"**. Esses itens não aparecem mais em ⏳ Validades, não entram no
aviso de "sem lote" e a Entrada não pede lote nem validade deles. Dá para
ligar/desligar a qualquer momento clicando no rótulo na coluna Validade,
em 📦 Itens.

**Uma vez só:** rode `supabase-controla-validade.sql` no SQL Editor do
Supabase (depois do `supabase.sql`), senão essa marcação não salva.

## Como usar (sem login)

O app não pede login nem senha. Ele usa uma **chave da loja** embutida no
arquivo: quem tem o arquivo acessa os dados do consultório, e mais ninguém.

1. No painel do Supabase do Consulveter → *SQL Editor*, rode (uma vez só):
   1. `supabase.sql` — cria as tabelas do consultório;
   2. `supabase-sem-login.sql` — grava a chave da loja e libera o acesso por
      ela. **Use a versão com a chave de verdade**, não a deste repositório
      (aqui fica só `__CHAVE_DA_LOJA__`).
2. Abra o `index.html` **com a mesma chave embutida** (troque
   `__CHAVE_DA_LOJA__` pela chave) no navegador de cada aparelho. Se o arquivo
   vier sem chave, o app pede a chave uma vez.
3. Em ⚙️ Configurações, informe o nome de quem usa aquele aparelho (vai em
   cada lançamento).
4. Em 📦 Itens → *+ Adicionar itens*, busque os produtos do Consulveter, marque
   os que ficam no consultório e escolha **Contagem do consultório** (entra nas
   contagens diárias) ou **Insumo**.
5. Lance o saldo inicial de cada item em 🔄 Entrada (motivo "Saldo inicial"),
   com lote e validade.

A chave só dá acesso às tabelas `cc_*` e aos nomes/códigos dos produtos.
Estoque, custo e preço do Consulveter continuam protegidos pelo login dele.
Para trocar a chave (se o arquivo vazar), rode de novo o
`supabase-sem-login.sql` com uma chave nova e distribua o arquivo novo.

Também existe o modo "Usar só neste aparelho", sem internet — os dados ficam
apenas naquele navegador.

## O que mudou em relação à planilha

| Planilha | App |
|---|---|
| Linhas SAÍDA/ENTRADA preenchidas no fim de cada contagem | Cada saída/entrada é lançada na hora (com lote, motivo, paciente/tutor e responsável). A contagem mostra automaticamente o que foi lançado desde a anterior. |
| Contar e escrever a quantidade de tudo, várias vezes por dia | O sistema já sabe quanto deveria ter. Na contagem você digita o que contou (ou toca ✓ quando bate) e **só as divergências ficam em vermelho**, exigindo justificativa. |
| DIFERENÇA calculada de cabeça | Diferença calculada sozinha; opção de corrigir o estoque com um ajuste registrado no histórico. |
| Sem controle de validade | Lotes com validade, saída "vence primeiro, sai primeiro" automática, alertas de vencidos/vencendo e botão de descarte. |
| Uma aba por mês | 📅 Diário monta a "planilha" de qualquer dia (início, entradas, saídas, cada contagem, fim) — imprimível e exportável em CSV. |

## Telas

- **Painel** — contagens do dia (feitas/pendentes/atrasadas), vencidos, vencendo,
  abaixo do mínimo e o saldo atual da geladeira.
- **Contagem** — 1ª contagem às 08:00 e 2ª às 19:00 (nomes e horários configuráveis). Lista os
  itens cadastrados em Itens; se não houver nenhum, mostra o botão para adicionar.
- **Entrada / Saída** — entrada (lote + validade + NF), saída, descarte e ajuste;
  aceita leitor de código de barras no campo de busca.
- **Validades** — lotes com saldo, ordenados pelo vencimento.
- **Diário**, **Histórico** (lançamentos e contagens, CSV) e **Itens**
  (inclui exportar a lista de nomes de produtos do Consulveter em CSV).

## Como os dados ficam guardados

Tabelas novas no mesmo Supabase do Consulveter (`cc_itens`, `cc_lotes`,
`cc_movs`, `cc_contagens`), acessíveis só com a chave da loja (ou pela conta
do Consulveter logada).
O saldo não é um número gravado: é a soma das movimentações. Assim duas pessoas
lançando ao mesmo tempo nunca apagam o lançamento uma da outra, e todo saldo
tem histórico que explica de onde veio.
