const { chromium } = require('playwright');
const S = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.clock.install({ time: new Date('2026-11-19T07:48:00-03:00') });
  await p.goto('http://localhost:5191/');
  await p.waitForTimeout(800);
  // dados de exemplo: contas e demandas
  await p.getByText('Acordar e beber água').click(); await p.waitForTimeout(200);
  await p.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('mari-dados-v1'));
    const id = () => Math.random().toString(36).slice(2, 10);
    d.bills = [
      { id: id(), name: 'Cartão Nubank', icon: '💳', amount: 386, repeat: 'mensal', dueDay: 18, dueDate: '', code: '34191.79001 01043.510047 91020.150008 1 12340000038600', notes: '' },
      { id: id(), name: 'Conta de luz', icon: '💡', amount: 142.3, repeat: 'mensal', dueDay: 21, dueDate: '', code: '', notes: 'Pagar pelo app do banco' },
      { id: id(), name: 'Internet', icon: '📶', amount: 89.9, repeat: 'mensal', dueDay: 25, dueDate: '', code: '', notes: '' },
      { id: id(), name: 'Aluguel', icon: '🏠', amount: 650, repeat: 'mensal', dueDay: 5, dueDate: '', code: '', notes: '' },
      { id: id(), name: 'Água', icon: '💧', amount: 61.8, repeat: 'mensal', dueDay: 10, dueDate: '', code: '', notes: '' },
    ];
    d.paid = {}; d.paid[d.bills[3].id + '|2026-11'] = '2026-11-04T12:00:00Z'; d.paid[d.bills[4].id + '|2026-11'] = '2026-11-09T12:00:00Z';
    d.tasks = [
      { id: id(), kind: 'compromisso', title: 'Consulta com a dentista', date: '2026-11-19', time: '10:00', priority: 'normal', notes: 'Sair de casa às 9:30 · levar documento', doneAt: null },
      { id: id(), kind: 'tarefa', title: 'Mandar e-mail para o RH', date: '2026-11-19', time: '14:00', priority: 'importante', notes: '', doneAt: null },
      { id: id(), kind: 'tarefa', title: 'Marcar consulta do gato', date: '2026-11-20', time: '', priority: 'normal', notes: '', doneAt: null },
      { id: id(), kind: 'tarefa', title: 'Trocar a lâmpada do banheiro', date: '', time: '', priority: 'pode-esperar', notes: '', doneAt: null },
    ];
    d.doneSteps = { '2026-11-19': [d.routines[0].steps[0].id, d.routines[0].steps[1].id] };
    localStorage.setItem('mari-dados-v1', JSON.stringify(d));
  });
  await p.reload(); await p.waitForTimeout(900);
  const shot = async (n) => { await p.waitForTimeout(300); await p.screenshot({ path: `${S}/m-${n}.png` }); };
  await shot('1-hoje');
  await p.getByRole('button', { name: 'Passo a passo' }).click();
  await p.getByText('Comer sentada à mesa').click();
  await shot('2-foco');
  await p.getByRole('button', { name: '← Voltar' }).click();
  await p.getByRole('button', { name: 'Contas' }).click(); await shot('3-contas');
  await p.getByRole('button', { name: 'Demandas' }).click(); await shot('4-demandas');
  await p.getByRole('button', { name: 'Semana' }).click(); await shot('5-semana');
  // modo noite + foco
  await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('mari-dados-v1')); d.settings.theme = 'noite'; localStorage.setItem('mari-dados-v1', JSON.stringify(d)); });
  await p.reload(); await p.waitForTimeout(700);
  await p.getByRole('button', { name: 'Passo a passo' }).click(); await shot('6-foco-noite');
  await p.getByRole('button', { name: '✓ Terminei' }).click(); await p.getByRole('button', { name: '✓ Terminei' }).click(); await shot('7-fim');
  await p.getByRole('button', { name: 'Voltar para Hoje' }).click();
  await p.getByRole('button', { name: 'Ajustes' }).click(); await shot('8-ajustes');
  await p.getByText('Rotina da manhã').click(); await shot('9-rotina');
  console.log('erros:', errs.length ? errs : 'nenhum');
  await b.close();
})();
