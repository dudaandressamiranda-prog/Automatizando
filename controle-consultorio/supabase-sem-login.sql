-- =====================================================================
-- Controle do Consultório — acesso SEM LOGIN, por chave da loja.
--
-- Rode DEPOIS do supabase.sql. Pode rodar de novo quando quiser trocar
-- a chave (aí use também o index.html novo com a mesma chave).
--
-- Como funciona: o app manda a chave no cabeçalho x-cc-chave. Sem a chave
-- certa ninguém lê nem grava nada. A chave só dá acesso às tabelas cc_*
-- e aos NOMES dos produtos (via cc_produtos) — estoque, custo e preço do
-- Consulveter continuam protegidos pelo login normal.
-- =====================================================================

create table if not exists public.cc_config (
  id        int primary key default 1 check (id = 1),
  chave     text not null,
  owner_id  uuid not null references auth.users on delete cascade
);
alter table public.cc_config enable row level security;   -- sem policies: invisível pela API

-- Dono = conta do Consulveter com o cadastro de produtos
insert into public.cc_config (id, chave, owner_id)
select 1, '__CHAVE_DA_LOJA__',
       (select user_id from public.products group by user_id order by count(*) desc limit 1)
on conflict (id) do update set chave = excluded.chave, owner_id = excluded.owner_id;

create or replace function public.cc_chave_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.cc_config c
    where c.chave = coalesce(current_setting('request.headers', true)::json->>'x-cc-chave', '')
  )
$$;

create or replace function public.cc_owner() returns uuid
language sql stable security definer set search_path = public as $$
  select owner_id from public.cc_config where id = 1
$$;

-- Usado pelo app para saber se a chave confere
create or replace function public.cc_ping() returns boolean
language sql stable security definer set search_path = public as $$
  select public.cc_chave_ok()
$$;

-- Só os nomes/códigos dos produtos do Consulveter, e só com a chave certa
create or replace function public.cc_produtos()
returns table (id uuid, name text, barcode text, category text, unit text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.barcode, p.category, p.unit
  from public.products p
  where public.cc_chave_ok()
    and p.user_id = public.cc_owner()
    and coalesce((to_jsonb(p)->>'active')::boolean, true)
$$;

-- Dono dos registros: quem estiver logado (equipe) ou, sem login, o dono da loja
create or replace function public.cc_set_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := coalesce(public.get_effective_owner_id(), public.cc_owner());
  return new;
end;
$$;

grant execute on function public.cc_ping(), public.cc_produtos() to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['cc_itens','cc_lotes','cc_movs','cc_contagens'] loop
    execute format('drop policy if exists "cc chave da loja" on public.%I', t);
    execute format('create policy "cc chave da loja" on public.%I for all to anon, authenticated using (public.cc_chave_ok() and user_id = public.cc_owner()) with check (public.cc_chave_ok() and user_id = public.cc_owner())', t);
    execute format('drop trigger if exists %I on public.%I', t || '_set_owner', t);
    execute format('create trigger %I before insert on public.%I for each row execute procedure public.cc_set_owner()', t || '_set_owner', t);
  end loop;
end $$;
