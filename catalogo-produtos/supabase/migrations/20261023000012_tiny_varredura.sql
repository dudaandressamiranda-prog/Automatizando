-- ---------------------------------------------------------------------------
-- Varredura do Tiny: compara todos os cadastros do Tiny com o catálogo e
-- monta uma prévia do que falta, para o admin escolher o que puxar.
--
-- A API do Tiny não traz foto na listagem: é preciso consultar produto por
-- produto, e o limite da conta é de 60 consultas por minuto. Com ~15 mil
-- cadastros, isso leva horas — por isso a varredura roda em segundo plano
-- (Edge Function tiny-varredura) e guarda o que já consultou em
-- tiny_produtos. A próxima varredura só reconsulta o que é novo, o que
-- mudou no Tiny ou o que ainda estava incompleto há mais de 30 dias.
--
-- Regra da dona: só entra cadastro COMPLETO — com foto E com código (EAN ou
-- SKU). Produto só com SKU entra; sem foto, ou sem EAN e sem SKU, nunca.
-- ---------------------------------------------------------------------------

-- SKU do Tiny, para produto que não tem EAN (e para achá-lo na próxima
-- varredura sem duplicar).
alter table public.products add column if not exists sku text;

create index if not exists products_external_id_idx on public.products (external_id);
create index if not exists products_sku_idx on public.products (sku) where sku is not null;
create index if not exists products_nome_norm_idx on public.products (public.catalog_norm(name));

-- Uma linha por cadastro do Tiny. Listagem: nome, códigos, situação.
-- Detalhe (consulta individual): marca, fornecedor, categoria, fotos, kit.
create table if not exists public.tiny_produtos (
  tiny_id           text primary key,
  nome              text not null,
  gtin              text,
  codigo            text,            -- SKU no Tiny
  situacao          text,            -- A ativo, I inativo (= não vende online)
  tipo_variacao     text,            -- N normal, P pai de variações, V variação
  listado_em        timestamptz not null default now(),
  alterado_no_tiny  timestamptz,     -- de lista.atualizacoes (últimos 30 dias)
  marca             text,
  fornecedor        text,
  categoria         text,
  fotos             text[],
  kit               boolean,
  detalhado_em      timestamptz
);

-- Estado da varredura em andamento (uma linha só).
create table if not exists public.tiny_varredura (
  id             int primary key default 1 check (id = 1),
  estado         text not null default 'parada',  -- parada | listando | detalhando | pronta | erro
  execucao       uuid,                            -- muda a cada início: corrente velha para sozinha
  pagina         int not null default 0,
  paginas        int,
  detalhados     int not null default 0,
  a_detalhar     int,
  mensagem       text,
  iniciada_em    timestamptz,
  concluida_em   timestamptz,
  atualizada_em  timestamptz,
  iniciada_por   text
);
insert into public.tiny_varredura (id) values (1) on conflict (id) do nothing;

-- Só admin lê; quem grava é a Edge Function (chave de serviço, fora da RLS).
alter table public.tiny_produtos enable row level security;
alter table public.tiny_varredura enable row level security;
drop policy if exists tiny_produtos_admin on public.tiny_produtos;
create policy tiny_produtos_admin on public.tiny_produtos
  for select to authenticated using (jwt_is_admin());
drop policy if exists tiny_varredura_admin on public.tiny_varredura;
create policy tiny_varredura_admin on public.tiny_varredura
  for select to authenticated using (jwt_is_admin());

-- Já está no catálogo? Pelo id do Tiny, pelo EAN ou pelo SKU.
create or replace function public.tiny_no_catalogo(t public.tiny_produtos)
returns boolean language sql stable as $$
  select exists (select 1 from public.products p where p.external_id = t.tiny_id)
      or (coalesce(t.gtin, '') <> '' and exists (select 1 from public.products p where p.barcode = t.gtin))
      or (coalesce(t.codigo, '') <> '' and exists (select 1 from public.products p where p.barcode = t.codigo))
      or (coalesce(t.codigo, '') <> '' and exists (select 1 from public.products p where p.sku = t.codigo));
$$;

-- Kit/combo pelo nome (mesma regra do importador); o detalhe ainda confere
-- a classe "K" do Tiny.
create or replace function public.tiny_parece_kit(nome text)
returns boolean language sql immutable as $$
  select coalesce(nome, '') ~* '^\s*(kit\y|combo\y|\d+\s*x\s)';
$$;

-- Fora do catálogo, com código, não é kit nem "pai" de variação: vale
-- consultar o detalhe (foto) no Tiny.
create or replace function public.tiny_interessa(t public.tiny_produtos)
returns boolean language sql stable as $$
  select (coalesce(t.gtin, '') <> '' or coalesce(t.codigo, '') <> '')
     and coalesce(t.tipo_variacao, '') <> 'P'
     and not public.tiny_parece_kit(t.nome)
     and not coalesce(t.kit, false)
     and not public.tiny_no_catalogo(t);
$$;

-- Próximos a consultar: nunca consultado, mudou no Tiny depois da consulta,
-- ou estava incompleto (sem foto) e a consulta tem mais de 30 dias.
create or replace function public.tiny_a_detalhar(limite int default 20)
returns setof text language sql stable as $$
  select t.tiny_id from public.tiny_produtos t
  where public.tiny_interessa(t)
    and (t.detalhado_em is null
         or t.alterado_no_tiny > t.detalhado_em
         or (coalesce(cardinality(t.fotos), 0) = 0 and t.detalhado_em < now() - interval '30 days'))
  order by (t.situacao = 'A') desc, t.tiny_id
  limit limite;
$$;

create or replace function public.tiny_conta_a_detalhar()
returns int language sql stable as $$
  select count(*)::int from public.tiny_produtos t
  where public.tiny_interessa(t)
    and (t.detalhado_em is null
         or t.alterado_no_tiny > t.detalhado_em
         or (coalesce(cardinality(t.fotos), 0) = 0 and t.detalhado_em < now() - interval '30 days'));
$$;

-- Prévia: só cadastros COMPLETOS (foto + código) que faltam no catálogo.
-- security_invoker: quem consulta passa pela RLS (só admin enxerga).
create or replace view public.tiny_candidatos with (security_invoker = true) as
select
  t.tiny_id, t.nome, t.gtin, t.codigo, t.situacao, t.tipo_variacao,
  t.marca, t.fornecedor, t.categoria, t.fotos,
  exists (
    select 1 from public.products p
    where public.catalog_norm(p.name) = public.catalog_norm(t.nome)
  ) as nome_parecido
from public.tiny_produtos t
where t.detalhado_em is not null
  and coalesce(cardinality(t.fotos), 0) > 0
  and public.tiny_interessa(t);

-- Números do resumo da tela.
create or replace function public.tiny_resumo()
returns json language sql stable security invoker as $$
  select json_build_object(
    'total',         count(*),
    'no_catalogo',   count(*) filter (where public.tiny_no_catalogo(t)),
    'sem_codigo',    count(*) filter (where coalesce(t.gtin, '') = '' and coalesce(t.codigo, '') = ''),
    'kits',          count(*) filter (where public.tiny_parece_kit(t.nome) or coalesce(t.kit, false)),
    'pais',          count(*) filter (where t.tipo_variacao = 'P'),
    'consultados',   count(*) filter (where t.detalhado_em is not null and public.tiny_interessa(t)),
    'sem_foto',      count(*) filter (where t.detalhado_em is not null and coalesce(cardinality(t.fotos), 0) = 0 and public.tiny_interessa(t)),
    'completos',     count(*) filter (where t.detalhado_em is not null and coalesce(cardinality(t.fotos), 0) > 0 and public.tiny_interessa(t))
  )
  from public.tiny_produtos t;
$$;
