-- ---------------------------------------------------------------------------
-- Fecha duas portas que ficaram abertas enquanto só existia um login.
--
-- 1) Quem é admin saía de `user_metadata`, e user_metadata é editável pelo
--    PRÓPRIO usuário: qualquer pessoa logada podia chamar
--    supabase.auth.updateUser({ data: { role: 'admin' } }) e virar admin
--    sozinha. Agora sai de `app_metadata`, que só muda com a chave de
--    serviço — quem está no navegador não alcança.
--
-- 2) A política de produtos era `using (true) with check (true)` para
--    qualquer autenticado, ou seja: qualquer funcionário logado podia
--    apagar o catálogo inteiro pela API, mesmo sem ver os botões na tela.
--    Esconder o menu nunca foi proteção — era só o menu.
--
-- ATENÇÃO À ORDEM: rode primeiro `npm run admin -- seu@email` no importador,
-- para gravar o papel em app_metadata. Se rodar este SQL antes disso, o
-- admin perde o acesso de escrita até o papel ser gravado.
-- ---------------------------------------------------------------------------

-- Papel do usuário logado, lido do JWT. app_metadata primeiro; user_metadata
-- continua aceito por um tempo para não derrubar quem ainda não migrou.
-- Quando todos estiverem em app_metadata, apagar a segunda metade.
create or replace function public.jwt_is_admin()
returns boolean language sql stable as $$
  select coalesce(
    current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role', ''
  ) = 'admin';
$$;

-- ---------------------------------------------------------------------------
-- Produtos e categorias: todo mundo logado LÊ, só admin ESCREVE
--
-- Ler tem de ser liberado — é o catálogo, é para isso que o app existe.
-- Escrever é do admin: funcionário monta carrinho, não edita cadastro.
-- ---------------------------------------------------------------------------
drop policy if exists products_authenticated_all on public.products;

drop policy if exists products_read on public.products;
create policy products_read on public.products
  for select to authenticated
  using (true);

drop policy if exists products_write on public.products;
create policy products_write on public.products
  for all to authenticated
  using (public.jwt_is_admin())
  with check (public.jwt_is_admin());

drop policy if exists categories_authenticated_all on public.categories;

drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories
  for select to authenticated
  using (true);

drop policy if exists categories_write on public.categories;
create policy categories_write on public.categories
  for all to authenticated
  using (public.jwt_is_admin())
  with check (public.jwt_is_admin());

-- ---------------------------------------------------------------------------
-- Fotos no bucket: mesma lógica. Ler todo mundo, mexer só admin.
-- ---------------------------------------------------------------------------
drop policy if exists product_photos_authenticated_write on storage.objects;
create policy product_photos_authenticated_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-photos' and public.jwt_is_admin());

drop policy if exists product_photos_authenticated_update on storage.objects;
create policy product_photos_authenticated_update on storage.objects
  for update to authenticated
  using (bucket_id = 'product-photos' and public.jwt_is_admin());

drop policy if exists product_photos_authenticated_delete on storage.objects;
create policy product_photos_authenticated_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-photos' and public.jwt_is_admin());
