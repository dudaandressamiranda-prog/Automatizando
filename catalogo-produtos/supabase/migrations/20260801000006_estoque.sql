-- ---------------------------------------------------------------------------
-- Estoque por depósito no produto
--
-- O catálogo não guardava estoque nenhum: quem quisesse saber olhava as
-- planilhas. Isso impede a única pergunta que interessa para priorizar o
-- trabalho manual — "o que está na prateleira AGORA e ainda não está
-- pronto para a vitrine?".
--
-- Três números separados porque eles contam histórias diferentes: o que
-- está na loja o cliente pega na mão hoje; o que está no depósito do
-- e-commerce só vende pelo site. Somar tudo apagaria essa diferença, que
-- é justamente a que decide se vale correr atrás da foto.
--
-- São um retrato da última importação, não estoque em tempo real — por
-- isso a data junto, para ninguém tomar decisão com número velho achando
-- que é de hoje.
-- ---------------------------------------------------------------------------

alter table public.products
  add column if not exists stock_centro   integer,
  add column if not exists stock_eldorado integer,
  add column if not exists stock_erp      integer,
  add column if not exists stock_synced_at timestamptz;

comment on column public.products.stock_centro    is 'Estoque na loja Centro, da última importação da planilha do painel.';
comment on column public.products.stock_eldorado  is 'Estoque na loja Eldorado, da última importação da planilha do painel.';
comment on column public.products.stock_erp       is 'Estoque no Tiny (depósito do e-commerce).';
comment on column public.products.stock_synced_at is 'Quando esses números foram atualizados pela última vez.';

-- Total das três origens. Coluna gerada para a tela filtrar e ordenar sem
-- repetir a soma em cada consulta — e sem risco de alguém somar diferente.
alter table public.products
  add column if not exists stock_total integer
    generated always as (
      coalesce(stock_centro, 0) + coalesce(stock_eldorado, 0) + coalesce(stock_erp, 0)
    ) stored;

-- A tela de pendências pede "tem estoque E falta foto ou código". O índice
-- parcial cobre exatamente essa fatia, que é pequena perto do catálogo.
create index if not exists products_pendencia_idx
  on public.products (stock_total desc)
  where stock_total > 0
    and (photo_path is null and photo_source_url is null or barcode is null);
