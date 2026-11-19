const { chromium } = require('playwright');
const S = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 760 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.clock.install({ time: new Date('2026-11-19T07:48:00-03:00') });
  await p.goto('http://localhost:5191/'); await p.waitForTimeout(600);
  // 1) Feito + Desfazer
  await p.getByRole('button', { name: '✓ Feito' }).click();
  const t1 = await p.locator('.toast').innerText();
  await p.getByRole('button', { name: 'Desfazer' }).click();
  const agora = await p.locator('.now h2').innerText();
  console.log('toast:', t1.replace(/\n/g, ' | '), '· depois de desfazer, Agora =', agora);
  // 2) janela com texto digitado: tocar fora pergunta
  await p.getByRole('button', { name: 'Demandas', exact: true }).click();
  await p.getByRole('button', { name: /Demanda$/ }).click();
  await p.locator('.sheet input').first().fill('Ligar para o banco');
  let perguntou = '';
  p.once('dialog', async (d) => { perguntou = d.message(); await d.dismiss(); });
  await p.mouse.click(10, 10); await p.waitForTimeout(200);
  console.log('perguntou ao tocar fora:', perguntou || 'NÃO', '· janela continua aberta:', await p.locator('.sheet').count());
  await p.getByRole('button', { name: 'Salvar' }).click();
  // 3) marcar demanda + desfazer pelo check
  await p.getByRole('checkbox', { name: 'Ligar para o banco' }).click();
  console.log('toast demanda:', (await p.locator('.toast').innerText()).replace(/\n/g, ' | '));
  // 4) letra maior
  await p.getByRole('button', { name: 'Hoje', exact: true }).click();
  await p.getByRole('button', { name: 'Ajustes' }).click();
  await p.getByRole('button', { name: 'Maior' }).click();
  await p.getByRole('button', { name: '← Voltar' }).click(); await p.waitForTimeout(300);
  await p.screenshot({ path: `${S}/z-hoje.png` });
  await p.getByRole('button', { name: 'Semana', exact: true }).click(); await p.waitForTimeout(300);
  await p.screenshot({ path: `${S}/z-semana.png` });
  const sw = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  console.log('rolagem para o lado:', sw ? 'SIM (problema)' : 'não', '· erros:', errs.length ? errs : 'nenhum');
  await b.close();
})();
