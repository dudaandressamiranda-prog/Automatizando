-- ---------------------------------------------------------------------------
-- Novo motivo de não reposição: "não tem no galpão"
--
-- Os motivos existentes explicam o produto ("fora de estoque", "não
-- trabalhamos mais") ou o pedido ("aguardando reposição"). Faltava o caso
-- mais comum do dia a dia: o produto existe e é vendido, mas o galpão não
-- tinha na hora de separar. Sem essa opção, quem separava marcava "fora de
-- estoque", e aí o relatório dizia que o item acabou quando na verdade só
-- não estava naquele depósito.
--
-- Rodar no SQL Editor do projeto Supabase.
-- ---------------------------------------------------------------------------

alter table public.cart_items
  drop constraint if exists cart_items_reason_check;

alter table public.cart_items
  add constraint cart_items_reason_check
  check (reason in ('fora_estoque', 'descontinuado', 'aguardando', 'sem_galpao'));
