-- =====================================================================
-- Controle do Consultório (Loja Centro) — tabelas no Supabase do
-- Consulveter Estoque.
--
-- Como usar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
-- Pode rodar mais de uma vez sem problema (é idempotente).
--
-- Reaproveita do Consulveter:
--   • a tabela public.products (só leitura — nome, código de barras…)
--   • as funções get_effective_owner_id() / set_effective_user_id(),
--     então os membros da equipe já vinculados enxergam os mesmos dados.
--
-- O saldo NÃO é guardado em coluna: ele é a soma das movimentações
-- (entrada +, saída −, ajuste ±). Assim duas pessoas lançando ao mesmo
-- tempo nunca "sobrescrevem" o estoque uma da outra.
-- =====================================================================

-- Itens controlados no consultório (vacinas/injetáveis de geladeira e insumos)
create table if not exists public.cc_itens (
  id             uuid default gen_random_uuid() primary key,
  user_id        uuid references auth.users on delete cascade not null,
  product_id     uuid references public.products on delete set null,
  nome           text not null,
  barcode        text,
  tipo           text not null default 'geladeira' check (tipo in ('geladeira','insumo')),
  unidade        text default 'UN',
  estoque_minimo numeric(10,3) default 0,
  ativo          boolean default true,
  ordem          integer default 0,
  controla_validade boolean not null default true,
  created_at     timestamptz default now()
);
create index if not exists cc_itens_user_idx on public.cc_itens(user_id);

-- Lotes (validade fica aqui)
create table if not exists public.cc_lotes (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users on delete cascade not null,
  item_id     uuid references public.cc_itens on delete cascade not null,
  lote        text not null,
  validade    date,
  created_at  timestamptz default now()
);
create index if not exists cc_lotes_item_idx on public.cc_lotes(item_id);
create index if not exists cc_lotes_user_idx on public.cc_lotes(user_id);

-- Movimentações (fonte do saldo)
create table if not exists public.cc_movs (
  id           uuid default gen_random_uuid() primary key,
  user_id      uuid references auth.users on delete cascade not null,
  item_id      uuid references public.cc_itens on delete cascade not null,
  lote_id      uuid references public.cc_lotes on delete set null,
  tipo         text not null check (tipo in ('entrada','saida','ajuste','descarte')),
  delta        numeric(10,3) not null,           -- entrada +, saída −, ajuste ±
  motivo       text,
  obs          text,
  documento    text,                             -- NF, pedido etc.
  responsavel  text,
  contagem_id  uuid,
  created_by   uuid default auth.uid(),
  created_at   timestamptz default now()
);
create index if not exists cc_movs_item_idx    on public.cc_movs(item_id);
create index if not exists cc_movs_user_idx    on public.cc_movs(user_id);
create index if not exists cc_movs_created_idx on public.cc_movs(created_at desc);

-- Contagens da geladeira (substitui as 3 contagens da planilha)
create table if not exists public.cc_contagens (
  id           uuid default gen_random_uuid() primary key,
  user_id      uuid references auth.users on delete cascade not null,
  data         date not null,
  turno        text not null,
  temperatura  numeric(4,1),
  temp_min     numeric(4,1),
  temp_max     numeric(4,1),
  itens        jsonb not null default '[]',      -- [{item_id, nome, sistema, contado}]
  divergencias integer default 0,
  obs          text,
  responsavel  text,
  created_by   uuid default auth.uid(),
  created_at   timestamptz default now()
);
create index if not exists cc_contagens_user_idx on public.cc_contagens(user_id);
create index if not exists cc_contagens_data_idx on public.cc_contagens(data desc);

-- Dono efetivo (equipe compartilhada) + RLS
do $$
declare t text;
begin
  foreach t in array array['cc_itens','cc_lotes','cc_movs','cc_contagens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "cc dono efetivo" on public.%I', t);
    execute format('create policy "cc dono efetivo" on public.%I for all using (user_id = public.get_effective_owner_id()) with check (user_id = public.get_effective_owner_id())', t);
    execute format('drop trigger if exists %I on public.%I', t || '_set_owner', t);
    execute format('create trigger %I before insert on public.%I for each row execute procedure public.set_effective_user_id()', t || '_set_owner', t);
  end loop;
end $$;
