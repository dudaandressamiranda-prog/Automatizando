-- Catálogo de Produtos — estrutura inicial
-- Projeto Supabase próprio (nenhuma relação com o Estoque Consulveter).
--
-- Rodar no SQL Editor do projeto novo, ou via `supabase db push`.

-- ---------------------------------------------------------------------------
-- Extensões
-- ---------------------------------------------------------------------------
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pg_trgm with schema extensions;   -- busca por nome (ILIKE / similaridade)

-- ---------------------------------------------------------------------------
-- Normalização de texto
-- ---------------------------------------------------------------------------
-- Usada para comparar nomes/marcas ignorando maiúsculas, acentos e espaços
-- repetidos. É IMMUTABLE de propósito: assim pode ser usada em índice e em
-- coluna gerada. O importador tem uma cópia idêntica em TypeScript
-- (importador/src/lib/normalize.ts) — se mudar aqui, mude lá também.
create or replace function public.catalog_norm(txt text)
returns text
language sql
immutable
parallel safe
as $$
  select btrim(
    regexp_replace(
      lower(
        translate(
          coalesce(txt, ''),
          'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
          'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'
        )
      ),
      '\s+', ' ', 'g'
    )
  );
$$;

comment on function public.catalog_norm(text) is
  'Normaliza texto (minúsculas, sem acento, espaços colapsados) para comparação e busca.';

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default extensions.uuid_generate_v4(),
  name        text not null check (btrim(name) <> ''),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Evita "Higiene" e "higiene " virarem duas categorias.
create unique index if not exists categories_name_norm_key
  on public.categories (public.catalog_norm(name));

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'product_status') then
    create type public.product_status as enum ('ativo', 'desativado', 'descontinuado');
  end if;
end
$$;

create table if not exists public.products (
  id                uuid primary key default extensions.uuid_generate_v4(),
  name              text not null check (btrim(name) <> ''),
  barcode           text check (barcode ~ '^[0-9]{6,14}$'),
  brand             text,
  supplier          text,
  category_id       uuid references public.categories (id) on delete set null,

  -- Foto: guardamos o caminho dentro do bucket, não a URL pronta.
  -- Assim dá para trocar o bucket de público para privado (URL assinada)
  -- sem reescrever a base inteira. A URL pública é montada no app.
  photo_path        text,
  photo_source_url  text,          -- de onde a foto veio (tela de edição do painel admin)
  photo_updated_at  timestamptz,

  status            public.product_status not null default 'ativo',

  -- Origem do registro. Texto + check em vez de enum: adicionar uma fonte
  -- nova é só trocar o check, sem ALTER TYPE.
  source            text not null default 'manual'
                      check (source in ('site_admin', 'pdf_fornecedor', 'erp', 'manual')),
  external_id       text,          -- id/slug do produto no sistema de origem (chave p/ buscar a foto)
  external_url      text,          -- link direto para a tela de edição na origem

  notes             text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Chave de deduplicação para produtos sem código de barras.
  dedupe_key        text generated always as (
                      public.catalog_norm(name) || '|' || public.catalog_norm(brand)
                    ) stored
);

-- Código de barras é único quando existe; vários produtos podem ficar sem.
create unique index if not exists products_barcode_key
  on public.products (barcode)
  where barcode is not null;

-- Mesmo produto reimportado da mesma origem não duplica.
create unique index if not exists products_source_external_id_key
  on public.products (source, external_id)
  where external_id is not null;

-- Não é único: dois produtos podem ter nome+marca iguais e códigos diferentes.
-- O importador usa este índice para achar candidatos e avisa quando há empate.
create index if not exists products_dedupe_key_idx
  on public.products (dedupe_key);

create index if not exists products_category_id_idx
  on public.products (category_id);

create index if not exists products_status_idx
  on public.products (status);

-- Busca por trecho do nome ("shamp inf" acha "Shampoo Infantil").
create index if not exists products_name_trgm_idx
  on public.products
  using gin (public.catalog_norm(name) extensions.gin_trgm_ops);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — só usuário logado enxerga/edita. Nada é público.
-- ---------------------------------------------------------------------------
alter table public.categories enable row level security;
alter table public.products   enable row level security;

drop policy if exists categories_authenticated_all on public.categories;
create policy categories_authenticated_all
  on public.categories
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists products_authenticated_all on public.products;
create policy products_authenticated_all
  on public.products
  for all
  to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- Storage: bucket das fotos
-- ---------------------------------------------------------------------------
-- public = false: as fotos só aparecem para quem está logado, via URL assinada.
-- Se depois o catálogo virar vitrine pública, basta trocar para true.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-photos',
  'product-photos',
  false,
  10 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do nothing;

drop policy if exists product_photos_authenticated_read on storage.objects;
create policy product_photos_authenticated_read
  on storage.objects for select to authenticated
  using (bucket_id = 'product-photos');

drop policy if exists product_photos_authenticated_write on storage.objects;
create policy product_photos_authenticated_write
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-photos');

drop policy if exists product_photos_authenticated_update on storage.objects;
create policy product_photos_authenticated_update
  on storage.objects for update to authenticated
  using (bucket_id = 'product-photos')
  with check (bucket_id = 'product-photos');

drop policy if exists product_photos_authenticated_delete on storage.objects;
create policy product_photos_authenticated_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-photos');
