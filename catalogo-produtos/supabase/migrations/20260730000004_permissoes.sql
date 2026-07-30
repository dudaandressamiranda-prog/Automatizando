-- Permissões de loja por email: o admin define, pelo app, qual funcionário
-- atende qual loja — sem precisar rodar SQL para cada um. A loja de um
-- funcionário deixa de vir do user_metadata e passa a vir desta tabela.
-- Rodar no SQL Editor do projeto Supabase.

create table if not exists public.store_members (
  email       text primary key,
  store       text not null check (store in ('centro', 'eldorado')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists store_members_set_updated_at on public.store_members;
create trigger store_members_set_updated_at
  before update on public.store_members
  for each row execute function public.set_updated_at();

-- e-mail do usuário logado (minúsculo), lido do JWT
create or replace function public.jwt_email()
returns text language sql stable as $$
  select lower(nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'email', ''));
$$;

-- loja do usuário logado, a partir da tabela de permissões.
-- SECURITY DEFINER para as policies de carrinho poderem chamá-la sem
-- esbarrar no RLS da própria tabela.
create or replace function public.my_store()
returns text language sql stable security definer set search_path = public as $$
  select store from public.store_members where lower(email) = public.jwt_email() limit 1;
$$;
grant execute on function public.my_store() to authenticated;

-- RLS: admin gerencia tudo; funcionário só lê a própria linha (para o app
-- descobrir a loja dele).
alter table public.store_members enable row level security;

drop policy if exists store_members_admin on public.store_members;
create policy store_members_admin on public.store_members
  for all to authenticated
  using (public.jwt_is_admin())
  with check (public.jwt_is_admin());

drop policy if exists store_members_self on public.store_members;
create policy store_members_self on public.store_members
  for select to authenticated
  using (lower(email) = public.jwt_email());

-- Carrinhos passam a usar a loja da tabela de permissões (my_store)
drop policy if exists carts_by_store on public.carts;
create policy carts_by_store on public.carts
  for all to authenticated
  using (public.jwt_is_admin() or store = public.my_store())
  with check (public.jwt_is_admin() or store = public.my_store());

drop policy if exists cart_items_by_store on public.cart_items;
create policy cart_items_by_store on public.cart_items
  for all to authenticated
  using (exists (
    select 1 from public.carts c
    where c.id = cart_id and (public.jwt_is_admin() or c.store = public.my_store())
  ))
  with check (exists (
    select 1 from public.carts c
    where c.id = cart_id and (public.jwt_is_admin() or c.store = public.my_store())
  ));
