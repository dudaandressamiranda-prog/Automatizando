/**
 * Marca (ou tira) o papel de admin de um usuário.
 *
 * O papel vai em `app_metadata`, não em `user_metadata`. A diferença é toda:
 * user_metadata o próprio usuário edita do navegador — bastava um
 * `updateUser({ data: { role: 'admin' } })` para se promover. app_metadata
 * só muda com a chave de serviço, que fica aqui e nunca no app.
 *
 * O papel entra no JWT, e é dele que as políticas do banco leem quem pode
 * escrever no catálogo.
 *
 * Uso:
 *   npm run admin                       # lista quem é o quê
 *   npm run admin -- fulano@email.com   # promove
 *   npm run admin -- fulano@email.com --remover
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const args = process.argv.slice(2);
  const remover = args.includes('--remover');
  const email = args.find((a) => !a.startsWith('--'))?.trim().toLowerCase();

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.');
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await db.auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(error.message);
  const usuarios = data.users;

  if (!email) {
    console.log('Contas de login:\n');
    for (const u of usuarios) {
      const app = (u.app_metadata as Record<string, unknown>)?.role;
      const user = (u.user_metadata as Record<string, unknown>)?.role;
      const papel = app === 'admin' ? 'ADMIN' : 'funcionário';
      const alerta = user === 'admin' && app !== 'admin' ? '  ⚠ admin só no user_metadata (inseguro)' : '';
      console.log(`  ${(u.email ?? '?').padEnd(38)} ${papel}${alerta}`);
    }
    console.log('\nPara promover: npm run admin -- fulano@email.com');
    return;
  }

  const alvo = usuarios.find((u) => u.email?.toLowerCase() === email);
  if (!alvo) {
    throw new Error(
      `Não existe conta para "${email}". Autorizar a loja não cria login — ` +
        'crie a conta em Authentication → Users no Supabase.',
    );
  }

  const { error: erroUp } = await db.auth.admin.updateUserById(alvo.id, {
    app_metadata: { ...(alvo.app_metadata as object), role: remover ? null : 'admin' },
  });
  if (erroUp) throw new Error(erroUp.message);
  console.log(`✅ ${email} agora é ${remover ? 'funcionário' : 'ADMIN'}.`);
  console.log('   O papel entra no token no próximo login — peça para sair e entrar de novo.');
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
