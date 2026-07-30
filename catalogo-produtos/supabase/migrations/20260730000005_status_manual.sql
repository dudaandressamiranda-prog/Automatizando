-- Protege a decisão humana sobre a situação do produto.
--
-- Os scripts de importação mexem no status a partir das planilhas: o ERP
-- diz "Inativo", o estoque da loja diz que está na prateleira, e o produto
-- é ativado ou desativado automaticamente. Sem uma marca, a próxima
-- importação desfaz o que foi decidido na mão — quem desativou um produto
-- pela tela o veria voltar para a vitrine sozinho.
--
-- Com `status_manual`, quem mexeu na situação pelo app fica travado: os
-- scripts leem essa marca e não encostam no status desses produtos.
-- Continuam atualizando nome, foto, marca e categoria normalmente.

alter table public.products
  add column if not exists status_manual boolean not null default false;

comment on column public.products.status_manual is
  'true = a situação foi definida por uma pessoa no app; os importadores não a alteram.';

-- Consulta típica dos scripts: "quem NÃO está travado".
create index if not exists products_status_manual_idx
  on public.products (status_manual)
  where status_manual;
