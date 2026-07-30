-- Carrinhos por loja (listas de compra/pedido) + itens, com controle de
-- acesso por loja: cada funcionário mexe só nos carrinhos da sua loja e o
-- admin vê os das duas. Rodar no SQL Editor do projeto Supabase.
--
-- Depende de metadados no login (definidos no cadastro do usuário):
--   user_metadata.store = 'centro' | 'eldorado'   (loja do funcionário)
--   user_metadata.role  = 'admin'                 (só para o dono)

-- ---------------------------------------------------------------------------
-- Helpers que leem o JWT do usuário logado
-- ---------------------------------------------------------------------------
create or replace function public.jwt_store()
returns text language sql stable as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'store', ''
  );
$$;

create or replace function public.jwt_is_admin()
returns boolean language sql stable as $$
  select coalesce(
    current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role', ''
  ) = 'admin';
$$;

-- ---------------------------------------------------------------------------
-- carts — um "carrinho" nomeado, pertencente a uma loja
-- ---------------------------------------------------------------------------
create table if not exists public.carts (
  id          uuid primary key default extensions.uuid_generate_v4(),
  store       text not null check (store in ('centro', 'eldorado')),
  name        text not null check (btrim(name) <> ''),
  created_by  text,                 -- email de quem criou
  status      text not null default 'aberto' check (status in ('aberto', 'finalizado')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists carts_store_idx on public.carts (store, status);

drop trigger if exists carts_set_updated_at on public.carts;
create trigger carts_set_updated_at
  before update on public.carts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- cart_items — produtos dentro de um carrinho (com autor e data)
-- ---------------------------------------------------------------------------
create table if not exists public.cart_items (
  id          uuid primary key default extensions.uuid_generate_v4(),
  cart_id     uuid not null references public.carts (id) on delete cascade,
  product_id  uuid not null references public.products (id) on delete cascade,
  qty         integer not null default 1 check (qty > 0),
  added_by    text,                 -- email de quem adicionou
  added_at    timestamptz not null default now(),
  unique (cart_id, product_id)
);
create index if not exists cart_items_cart_idx on public.cart_items (cart_id);

-- ---------------------------------------------------------------------------
-- RLS: funcionário mexe só na sua loja; admin vê/edita tudo
-- ---------------------------------------------------------------------------
alter table public.carts      enable row level security;
alter table public.cart_items enable row level security;

drop policy if exists carts_by_store on public.carts;
create policy carts_by_store on public.carts
  for all to authenticated
  using (public.jwt_is_admin() or store = public.jwt_store())
  with check (public.jwt_is_admin() or store = public.jwt_store());

drop policy if exists cart_items_by_store on public.cart_items;
create policy cart_items_by_store on public.cart_items
  for all to authenticated
  using (exists (
    select 1 from public.carts c
    where c.id = cart_id and (public.jwt_is_admin() or c.store = public.jwt_store())
  ))
  with check (exists (
    select 1 from public.carts c
    where c.id = cart_id and (public.jwt_is_admin() or c.store = public.jwt_store())
  ));
