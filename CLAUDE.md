# Combinados deste projeto

## SQL vai sempre colado na conversa

Toda vez que uma alteração precisar de SQL, **colar o conteúdo inteiro na
resposta**, dentro de um bloco de código, pronto para copiar e colar no SQL
Editor do Supabase.

Nunca mandar só o caminho do arquivo. Já aconteceu de o caminho ser colado no
editor e virar `syntax error at or near "supabase"` — o arquivo continua sendo
salvo em `catalogo-produtos/supabase/migrations/`, mas quem executa é uma
pessoa no navegador, e ela precisa do texto à mão.

## Projeto certo no Supabase

O catálogo é o projeto **catalogo-produtos**, referência `rzjsgygislkdwewtskev`.
Existe outro projeto na mesma conta ("Consulveter Estoque") que **não** tem as
tabelas deste app — rodar SQL lá dá "relation does not exist".

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
