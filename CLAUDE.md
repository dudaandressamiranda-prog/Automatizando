# Combinados deste projeto

## SQL vai sempre colado na conversa

Toda vez que uma alteração precisar de SQL, **colar o conteúdo inteiro na
resposta**, dentro de um bloco de código, pronto para copiar e colar no SQL
Editor do Supabase.

Nunca mandar só o caminho do arquivo. Já aconteceu de o caminho ser colado no
editor e virar `syntax error at or near "supabase"` — o arquivo continua sendo
salvo em `catalogo-produtos/supabase/migrations/`, mas quem executa é uma
pessoa no navegador, e ela precisa do texto à mão.

O `apply_migration` do MCP do Supabase pede uma aprovação que a dona não
consegue dar pelo chat: não insistir — colar o SQL e pedir para ela rodar.
Depois, conferir com uma consulta se entrou.

## Projeto certo no Supabase

O catálogo é o projeto **catalogo-produtos**, referência `rzjsgygislkdwewtskev`.
Existe outro projeto na mesma conta ("Consulveter Estoque") que **não** tem as
tabelas deste app — rodar SQL lá dá "relation does not exist".

## Onde o app vai ao ar

- O app fica em `catalogo-produtos/app` e está em
  **https://automatizando-ecru.vercel.app**.
- O Vercel publica em **produção cada push na branch `claude/session-r1hhjp`**.
  A branch padrão do repositório (`claude/smart-gate-mobile-control-axjq9x`) é
  de outros apps — não mexer nela por causa do catálogo.
- "Não atualizou" quase sempre é aba antiga (Ctrl+Shift+R) ou dados guardados
  no navegador (Configurações do site → Excluir dados). O app não tem service
  worker.

## O que este sistema não faz

Não há controle de estoque, e nenhuma tela deve introduzir um. Quantidades que
aparecem (item de carrinho, retirada para uso interno) são **informativas**:
não descontam de lugar nenhum e não entram em conta.

## Decisões da dona que valem para sempre

- Produto **ativo** só com foto. Sem foto, fica desativado até alguém completar.
- O que ela desativa à mão **não volta sozinho**: `products.status_manual`
  marca a decisão humana e todo script tem de respeitá-la.
- Estoque zerado só desativa quando está zerado no **total** — produto que só
  vende no e-commerce fica zerado nas lojas e nem por isso sai do catálogo.
- **Galpão** (`products.galpao`) é marcação à parte: nunca mexe na categoria.
- Na sincronização com o Tiny, só entra cadastro **completo: com foto e com
  código** (EAN ou SKU). Sem foto, ou sem EAN e sem SKU, nunca.
- Validade lida pela câmera **nunca** pode ser a data de fabricação: na dúvida,
  não preencher (ver `app/src/lib/loteParser.ts` e seus testes).

## Quem é admin

- Admin é quem tem `app_metadata.role = 'admin'` na conta (o mesmo que o banco
  confere em `jwt_is_admin()`), ligado/desligado em **Funcionários e lojas**.
  Os e-mails de `VITE_ADMIN_EMAILS` continuam admin como garantia.
- Quem entra **sem cadastro** (login anônimo) nunca é admin e só faz o que um
  funcionário comum faz.
- A tela esconde, mas quem barra de verdade é a RLS: escrita em `products`
  só para admin.

## Tiny (ERP)

- O token do Tiny fica **só** no segredo `TINY_TOKEN` das Edge Functions do
  Supabase. Nunca no app, no repositório ou em arquivo do Drive.
- As consultas passam pelas funções `tiny-produto` (por EAN ou por nome) e
  `tiny-varredura` (todos os cadastros, em segundo plano). Fonte em
  `catalogo-produtos/supabase/functions/`; publicar com o MCP do Supabase.
- Limite da conta: 60 chamadas por minuto, e a foto só vem consultando produto
  por produto — por isso a varredura é lenta e roda em segundo plano.

## Códigos de barras

- EAN-13 com dígito verificador errado sai na etiqueta em **Code 128**, com o
  número exato (a impressora recalcularia o 13º dígito do EAN).
- EAN gerado pelo catálogo é da faixa interna **2** (uso só na loja). Nunca
  inventar número 789: EAN de verdade só com prefixo da GS1.

## Ao mexer no código

- Testes: `npm test` dentro de `catalogo-produtos/app`. Rodam direto no Node,
  então arquivos importados pelos testes usam a extensão `.ts` nos imports.
- A dona não é técnica: explicar em português simples, um passo por vez, e
  conferir telas no navegador (Playwright com o Chromium já instalado) antes
  de dizer que está pronto.
