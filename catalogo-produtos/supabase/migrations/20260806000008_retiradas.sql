-- ---------------------------------------------------------------------------
-- Retiradas para uso interno
--
-- Registro do que sai da prateleira sem passar pelo caixa: o shampoo que o
-- banho e tosa usou, o saco de ração aberto para vender a granel. É
-- informativo — o catálogo não controla estoque e nada aqui desconta de
-- lugar nenhum. Serve para a loja saber depois o que foi consumido em casa.
--
-- Rodar no SQL Editor do projeto Supabase.
-- ---------------------------------------------------------------------------

create table if not exists public.retiradas (
  id          uuid primary key default extensions.uuid_generate_v4(),
  store       text not null check (store in ('centro', 'eldorado')),

  -- O produto pode ser apagado do catálogo um dia; o registro de que ele foi
  -- usado não deixa de ser verdade por isso. Por isso o nome fica gravado
  -- aqui como cópia: sem ele, apagar um produto abriria buracos no
  -- histórico, que é justamente o que este módulo existe para guardar.
  product_id   uuid references public.products (id) on delete set null,
  product_name text not null check (btrim(product_name) <> ''),
  barcode      text,

  -- Por que saiu. 'banho_tosa' é o uso do serviço; 'granel' é o saco aberto
  -- para vender solto — situações diferentes que a loja lê de formas
  -- diferentes na hora de conferir o mês.
  tipo        text not null default 'banho_tosa'
                check (tipo in ('banho_tosa', 'granel', 'outro')),

  -- Fracionado de propósito: ração a granel sai em quilos com casas
  -- decimais, e arredondar para inteiro perderia o dado.
  qty         numeric(10, 3) not null check (qty > 0),
  unidade     text not null default 'un' check (unidade in ('un', 'kg', 'g', 'ml', 'l')),

  notes       text,
  created_by  text,
  created_at  timestamptz not null default now()
);

-- A tela lista por loja e por data, do mais recente para o mais antigo.
create index if not exists retiradas_store_data_idx
  on public.retiradas (store, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: funcionário só enxerga e registra na loja dele; admin vê tudo.
-- Mesma regra dos carrinhos, para não haver duas noções de "minha loja".
-- ---------------------------------------------------------------------------
alter table public.retiradas enable row level security;

drop policy if exists retiradas_by_store on public.retiradas;
create policy retiradas_by_store on public.retiradas
  for all to authenticated
  using (public.jwt_is_admin() or store = public.my_store())
  with check (public.jwt_is_admin() or store = public.my_store());
