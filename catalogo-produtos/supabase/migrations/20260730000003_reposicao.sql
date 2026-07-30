-- Reposição por item de carrinho. Incremental e idempotente: use se você
-- já tinha rodado a migration de carrinhos ANTES de ela ganhar estas
-- colunas. Se rodar a de carrinhos já atualizada, isto não faz nada de novo.

alter table public.cart_items
  add column if not exists status text not null default 'pendente',
  add column if not exists reason text,
  add column if not exists resolved_by text,
  add column if not exists resolved_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cart_items_status_check'
  ) then
    alter table public.cart_items
      add constraint cart_items_status_check
      check (status in ('pendente', 'reposto', 'nao_reposto'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'cart_items_reason_check'
  ) then
    alter table public.cart_items
      add constraint cart_items_reason_check
      check (reason in ('fora_estoque', 'descontinuado', 'aguardando'));
  end if;
end
$$;
