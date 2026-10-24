-- ---------------------------------------------------------------------------
-- Administradores escolhidos pela tela (Funcionários e lojas).
--
-- Quem é admin já é decidido pela conta: app_metadata.role = 'admin' — é o
-- que jwt_is_admin() confere nas regras do banco e o que as Edge Functions
-- do Tiny conferem. Só que app_metadata não pode ser mexido pelo app (de
-- propósito: senão qualquer um se promovia). Estas duas funções rodam com
-- permissão de dono (security definer) e só obedecem a quem JÁ é admin.
--
-- A mudança vale no próximo login da pessoa (ou em até 1 hora, quando a
-- sessão dela se renova sozinha).
-- ---------------------------------------------------------------------------

-- Contas com login (e-mail). Quem entrou "sem cadastro" não aparece.
create or replace function public.admin_listar_usuarios()
returns table (id uuid, email text, admin boolean, ultimo_login timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.email::text, coalesce(u.raw_app_meta_data ->> 'role', '') = 'admin', u.last_sign_in_at
  from auth.users u
  where public.jwt_is_admin()
    and u.email is not null
    and not coalesce(u.is_anonymous, false)
  order by u.email;
$$;

create or replace function public.admin_definir(alvo uuid, tornar_admin boolean)
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.jwt_is_admin() then
    raise exception 'Só administradores podem mudar quem é admin.';
  end if;
  -- ninguém se tranca fora sem querer
  if not tornar_admin and alvo = auth.uid() then
    raise exception 'Você não pode tirar o seu próprio acesso de administrador.';
  end if;
  update auth.users
     set raw_app_meta_data = case
           when tornar_admin then coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
           else coalesce(raw_app_meta_data, '{}'::jsonb) - 'role'
         end
   where id = alvo
     and email is not null
     and not coalesce(is_anonymous, false);
  if not found then
    raise exception 'Conta não encontrada.';
  end if;
end;
$$;

revoke all on function public.admin_listar_usuarios() from public, anon;
revoke all on function public.admin_definir(uuid, boolean) from public, anon;
grant execute on function public.admin_listar_usuarios() to authenticated;
grant execute on function public.admin_definir(uuid, boolean) to authenticated;
