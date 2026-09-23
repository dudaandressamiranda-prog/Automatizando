-- ---------------------------------------------------------------------------
-- Lotes e validades
--
-- Conferência de prateleira: a pessoa bipa o produto, a câmera lê o lote e a
-- validade impressos na embalagem e o app grava o TEXTO (nenhuma foto). Serve
-- para a loja enxergar o que vence primeiro. Não é controle de estoque: não
-- há quantidade e nada aqui desconta de lugar nenhum.
--
-- Rodar no SQL Editor do projeto Supabase (catalogo-produtos).
-- ---------------------------------------------------------------------------

create table if not exists public.validades (
  id          uuid primary key default extensions.uuid_generate_v4(),
  store       text not null check (store in ('centro', 'eldorado')),

  -- Mesmo raciocínio das retiradas: o nome fica gravado como cópia para o
  -- registro continuar legível se o produto sair do catálogo.
  product_id   uuid references public.products (id) on delete set null,
  product_name text not null check (btrim(product_name) <> ''),
  barcode      text,

  lote        text,
  -- Dia exato, ou o último dia do mês quando a embalagem só traz mês/ano
  -- (validade_so_mes = true) — assim ordenar e alertar funcionam igual.
  validade        date,
  validade_so_mes boolean not null default false,

  created_by  text,
  created_at  timestamptz not null default now(),

  -- Registro vazio não serve para nada.
  constraint validades_tem_dado check (nullif(btrim(lote), '') is not null or validade is not null)
);

-- A tela lista por loja, do que vence primeiro para o último.
create index if not exists validades_store_validade_idx
  on public.validades (store, validade);

-- ---------------------------------------------------------------------------
-- RLS: funcionário só enxerga e registra na loja dele; admin vê tudo.
-- Mesma regra dos carrinhos e das retiradas.
-- ---------------------------------------------------------------------------
alter table public.validades enable row level security;

drop policy if exists validades_by_store on public.validades;
create policy validades_by_store on public.validades
  for all to authenticated
  using (public.jwt_is_admin() or store = public.my_store())
  with check (public.jwt_is_admin() or store = public.my_store());
