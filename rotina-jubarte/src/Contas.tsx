import { useState } from 'react';
import { useData, update, contasDoMes, diffDays, quando, reais, MESES, uid, Bill, BillDue, ymd, ym, dataCurta, pad } from './store';
import { Baleia, Sheet, copiar, toast, desfazer as avisoDesfazer, Icon, Cauda } from './ui';

const ICONES = ['🏠', '💡', '💧', '📶', '📱', '💳', '🛒', '🚗', '🏥', '🎓', '📺', '🐾', '🧾'];

export function Contas() {
  const data = useData();
  const hoje = new Date();
  const [mes, setMes] = useState(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const [edit, setEdit] = useState<Bill | 'novo' | null>(null);
  const [verPagas, setVerPagas] = useState(false);
  const lista = contasDoMes(data, mes.getFullYear(), mes.getMonth());
  const pagas = lista.filter((c) => c.paidAt);
  const abertas = lista.filter((c) => !c.paidAt);
  const atrasadas = abertas.filter((c) => diffDays(c.due, hoje) < 0);
  const logo = abertas.filter((c) => { const n = diffDays(c.due, hoje); return n >= 0 && n <= 7; });
  const depois = abertas.filter((c) => diffDays(c.due, hoje) > 7);
  const total = lista.reduce((s, c) => s + (c.bill.amount || 0), 0);
  const pago = pagas.reduce((s, c) => s + (c.bill.amount || 0), 0);
  const tudoPago = lista.length > 0 && abertas.length === 0;

  const pagar = (c: BillDue) => {
    update((d) => { d.paid[c.key] = new Date().toISOString(); });
    avisoDesfazer(`${c.bill.name}: paga! 🐋`, () => update((d) => { delete d.paid[c.key]; }));
  };
  const desfazer = (c: BillDue) => update((d) => { delete d.paid[c.key]; });
  const mudaMes = (n: number) => setMes(new Date(mes.getFullYear(), mes.getMonth() + n, 1));

  return (
    <div className="page">
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
        <div className="monthnav">
          <button className="iconbtn" aria-label="Mês anterior" onClick={() => mudaMes(-1)}>‹</button>
          <button className="iconbtn" aria-label="Próximo mês" onClick={() => mudaMes(1)}>›</button>
        </div>
        <button className="btn primary small" onClick={() => setEdit('novo')}>{Icon.mais} Nova conta</button>
      </div>
      <h1 className="title">Contas de {MESES[mes.getMonth()]}{mes.getFullYear() !== hoje.getFullYear() ? ` ${mes.getFullYear()}` : ''}</h1>

      {lista.length === 0 ? (
        <div className="card vazio">
          <Baleia q="clara" w={160} />
          <h3>Nenhuma conta neste mês</h3>
          <p className="small">Cadastre as contas que se repetem (aluguel, luz, internet…) uma vez só e o app lembra todo mês.</p>
          <button className="btn primary" style={{ marginTop: 14 }} onClick={() => setEdit('novo')}>Cadastrar conta</button>
        </div>
      ) : tudoPago ? (
        <div className="card vazio">
          <Baleia q="dourada" w={210} className="swim" />
          <h3>Tudo pago este mês!</h3>
          <p className="small">{pagas.length} {pagas.length === 1 ? 'conta paga' : 'contas pagas'}{total ? ` · ${reais(total)}` : ''}. Pode respirar.</p>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 6 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <b style={{ fontSize: 17 }}>{pagas.length} de {lista.length} pagas</b>
              {total > 0 && <div className="small">{reais(pago)} de {reais(total)}</div>}
            </div>
            <Baleia q="dourada" w={108} style={{ margin: '-8px -4px -6px 0' }} />
          </div>
          <div className="bar"><i style={{ width: `${(pagas.length / lista.length) * 100}%` }} /></div>
          {total > 0 && <div className="small">Faltam {reais(total - pago)}</div>}
        </div>
      )}

      {atrasadas.length > 0 && <div className="grp">Precisa de atenção</div>}
      {atrasadas.map((c) => <ContaCard key={c.key} c={c} hoje={hoje} onPagar={pagar} onEdit={setEdit} />)}
      {logo.length > 0 && <div className="grp">Vence logo</div>}
      {logo.map((c) => <ContaCard key={c.key} c={c} hoje={hoje} onPagar={pagar} onEdit={setEdit} />)}
      {depois.length > 0 && <div className="grp">Mais para frente</div>}
      {depois.map((c) => <ContaCard key={c.key} c={c} hoje={hoje} onPagar={pagar} onEdit={setEdit} />)}

      {pagas.length > 0 && (
        <>
          <div className="grp">Pagas ✓</div>
          {!verPagas ? (
            <button className="card row" style={{ width: '100%', background: 'var(--kelpbg)', borderColor: 'transparent', textAlign: 'left' }} onClick={() => setVerPagas(true)}>
              <span style={{ flex: 1 }}>{pagas.slice(0, 3).map((c) => c.bill.name).join(', ')}{pagas.length > 3 ? ` e mais ${pagas.length - 3}` : ''}</span>
              <span style={{ color: 'var(--kelp)' }}><Cauda size={24} /></span>
            </button>
          ) : pagas.map((c) => (
            <div key={c.key} className="card bill" style={{ background: 'var(--kelpbg)', borderColor: 'transparent' }}>
              <div className="row">
                <div className="ico">{c.bill.icon || '🧾'}</div>
                <div style={{ flex: 1 }}>
                  <div className="nm">{c.bill.name}</div>
                  <div className="small">Paga em {dataCurta(new Date(c.paidAt!))}</div>
                </div>
                <button className="btn ghost small" onClick={() => desfazer(c)}>Desfazer</button>
              </div>
            </div>
          ))}
        </>
      )}

      {edit && <ContaForm bill={edit === 'novo' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function ContaCard({ c, hoje, onPagar, onEdit }: {
  c: BillDue; hoje: Date; onPagar: (c: BillDue) => void; onEdit: (b: Bill) => void;
}) {
  const n = diffDays(c.due, hoje);
  const atrasada = n < 0;
  return (
    <div className={'card bill' + (atrasada ? ' coral' : '')}>
      <button className="row" style={{ alignItems: 'flex-start', background: 'none', border: 0, width: '100%', textAlign: 'left' }} onClick={() => onEdit(c.bill)}>
        <div className="ico" style={atrasada ? { background: 'rgba(255,255,255,.5)' } : undefined}>{c.bill.icon || '🧾'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="nm">{c.bill.name}</div>
          {atrasada ? (
            <>
              <span className="chip coral" style={{ marginTop: 4, background: 'rgba(255,255,255,.5)' }}>Venceu {quando(c.due, hoje)}</span>
              <div className="small" style={{ marginTop: 4 }}>Ainda dá para pagar. Um passo de cada vez.</div>
            </>
          ) : n <= 7 ? (
            <span className="chip lamp" style={{ marginTop: 4 }}>{n === 0 ? 'Vence hoje' : `${quando(c.due, hoje)[0].toUpperCase()}${quando(c.due, hoje).slice(1)}`} · {dataCurta(c.due)}</span>
          ) : (
            <div className="small" style={{ marginTop: 4 }}>{dataCurta(c.due)}{c.bill.repeat === 'mensal' ? ' · todo mês' : ''}</div>
          )}
        </div>
        <div className="val">{reais(c.bill.amount)}</div>
      </button>
      {c.bill.notes && <div className="small" style={{ marginTop: 8 }}>{c.bill.notes}</div>}
      <div className="acts">
        <button className="btn primary small" style={{ flex: 1 }} onClick={() => onPagar(c)}>✓ Paguei</button>
        {c.bill.code && <button className="btn ghost small" onClick={() => copiar(c.bill.code)}>Copiar código</button>}
      </div>
    </div>
  );
}

function ContaForm({ bill, onClose }: { bill: Bill | null; onClose: () => void }) {
  const hoje = new Date();
  const [f, setF] = useState<Bill>(bill ?? {
    id: uid(), name: '', icon: '🧾', amount: null, repeat: 'mensal', dueDay: hoje.getDate(),
    dueDate: ymd(hoje), code: '', notes: '', since: ym(hoje),
  });
  const [valor, setValor] = useState(bill?.amount != null ? String(bill.amount).replace('.', ',') : '');
  const set = (p: Partial<Bill>) => setF((x) => ({ ...x, ...p }));

  const salvar = () => {
    if (!f.name.trim()) { toast('Escreva o nome da conta.'); return; }
    const v = valor.trim() ? Number(valor.replace(/\./g, '').replace(',', '.')) : null;
    if (v != null && (isNaN(v) || v < 0)) { toast('O valor não está certo. Ex.: 142,30'); return; }
    const pronto = { ...f, name: f.name.trim(), amount: v, dueDay: Math.min(31, Math.max(1, f.dueDay || 1)) };
    update((d) => {
      const i = d.bills.findIndex((b) => b.id === pronto.id);
      if (i >= 0) d.bills[i] = pronto; else d.bills.push(pronto);
    });
    onClose();
  };
  const apagar = () => {
    if (!confirm(`Apagar a conta "${f.name}"?`)) return;
    update((d) => {
      d.bills = d.bills.filter((b) => b.id !== f.id);
      for (const k of Object.keys(d.paid)) if (k.startsWith(f.id + '|')) delete d.paid[k];
    });
    onClose();
  };

  return (
    <Sheet title={bill ? 'Editar conta' : 'Nova conta'} onClose={onClose}>
      <label className="field"><span>Nome</span>
        <input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Conta de luz" />
      </label>
      <div className="field"><span>Ícone</span>
        <div className="emojis">
          {ICONES.map((i) => <button key={i} className={f.icon === i ? 'on' : ''} onClick={() => set({ icon: i })}>{i}</button>)}
        </div>
      </div>
      <label className="field"><span>Valor (opcional)</span>
        <input className="input" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ex.: 142,30" />
      </label>
      <div className="field"><span>Repete?</span>
        <div className="seg">
          <button className={f.repeat === 'mensal' ? 'on' : ''} onClick={() => set({ repeat: 'mensal' })}>Todo mês</button>
          <button className={f.repeat === 'unica' ? 'on' : ''} onClick={() => set({ repeat: 'unica' })}>Só uma vez</button>
        </div>
      </div>
      {f.repeat === 'mensal' ? (
        <label className="field"><span>Vence todo dia</span>
          <select className="input" value={f.dueDay} onChange={(e) => set({ dueDay: Number(e.target.value) })}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{pad(n)}</option>)}
          </select>
        </label>
      ) : (
        <label className="field"><span>Vence em</span>
          <input className="input" type="date" value={f.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
        </label>
      )}
      <label className="field"><span>Código de barras ou Pix (opcional)</span>
        <textarea className="input" value={f.code} onChange={(e) => set({ code: e.target.value })} placeholder="Cole aqui para copiar na hora de pagar" />
      </label>
      <label className="field"><span>Observação (opcional)</span>
        <input className="input" value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Ex.: pagar pelo app do banco" />
      </label>
      <button className="btn primary block" style={{ marginTop: 20 }} onClick={salvar}>Salvar</button>
      {bill && <button className="btn danger block" style={{ marginTop: 10 }} onClick={apagar}>Apagar conta</button>}
    </Sheet>
  );
}
