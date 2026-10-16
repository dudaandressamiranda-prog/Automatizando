-- ---------------------------------------------------------------------------
-- Acesso sem cadastro ("Entrar sem cadastro"): quem ajuda na loja sem ter
-- uma conta criada entra direto, digita o nome e escolhe a loja na hora —
-- sem senha, sem passar pela tabela de permissões (store_members).
--
-- Tecnicamente isso usa o login anônimo do Supabase (signInAnonymously):
-- cria uma sessão de verdade, com token, mas sem e-mail. Essa sessão nunca
-- está em store_members, então my_store() nunca acha nada pra ela — por
-- isso as políticas de carrinho/retirada/validade precisam de uma 3ª
-- permissão, além de "é admin" e "a loja bate com a cadastrada": "é uma
-- sessão anônima".
--
-- ATENÇÃO: isso só funciona depois de ligar "Allow anonymous sign-ins" em
-- Authentication → Sign In / Providers, no painel do Supabase (projeto
-- catalogo-produtos). Esse botão não é SQL, é configuração da plataforma,
-- não dá pra ligar por aqui.
-- ---------------------------------------------------------------------------

create or replace function public.jwt_is_anonymous()
returns boolean language sql stable as $$
  select coalesce(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'is_anonymous')::boolean, false
  );
$$;

drop policy if exists carts_by_store on public.carts;
create policy carts_by_store on public.carts
  for all to authenticated
  using (jwt_is_admin() or store = my_store() or jwt_is_anonymous())
  with check (jwt_is_admin() or store = my_store() or jwt_is_anonymous());

drop policy if exists cart_items_by_store on public.cart_items;
create policy cart_items_by_store on public.cart_items
  for all to authenticated
  using (
    exists (
      select 1 from public.carts c
      where c.id = cart_items.cart_id
        and (jwt_is_admin() or c.store = my_store() or jwt_is_anonymous())
    )
  )
  with check (
    exists (
      select 1 from public.carts c
      where c.id = cart_items.cart_id
        and (jwt_is_admin() or c.store = my_store() or jwt_is_anonymous())
    )
  );

drop policy if exists retiradas_by_store on public.retiradas;
create policy retiradas_by_store on public.retiradas
  for all to authenticated
  using (jwt_is_admin() or store = my_store() or jwt_is_anonymous())
  with check (jwt_is_admin() or store = my_store() or jwt_is_anonymous());

drop policy if exists validades_by_store on public.validades;
create policy validades_by_store on public.validades
  for all to authenticated
  using (jwt_is_admin() or store = my_store() or jwt_is_anonymous())
  with check (jwt_is_admin() or store = my_store() or jwt_is_anonymous());
