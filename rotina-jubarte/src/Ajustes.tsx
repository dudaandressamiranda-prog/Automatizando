import { useRef, useState } from 'react';
import { useData, update, replaceAll, getData, uid, Routine, Step, DIAS_CURTOS, toMin, fromMin, ymd, normalizar } from './store';
import { Sheet, toast, Baleia, Icon } from './ui';
import { avisoSuportado, avisoPermitido, pedirPermissao, gerarIcs } from './avisos';

function baixar(nome: string, conteudo: string, tipo: string) {
  const blob = new Blob([conteudo], { type: tipo });
  const file = new File([blob], nome, { type: tipo });
  const nav = navigator as any;
  if (nav.canShare?.({ files: [file] })) {
    nav.share({ files: [file], title: nome }).catch(() => {});
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function Ajustes({ onClose }: { onClose: () => void }) {
  const data = useData();
  const [rot, setRot] = useState<Routine | null>(null);
  const [cal, setCal] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const s = data.settings;
  const setS = (p: Partial<typeof s>) => update((d) => { d.settings = { ...d.settings, ...p }; });

  const ligarAvisos = async (on: boolean) => {
    if (on && !avisoPermitido()) {
      const ok = await pedirPermissao();
      if (!ok) { toast('O iPhone não deixou. Veja as instruções abaixo.'); return; }
    }
    setS({ notify: on });
  };

  const importar = async (f: File) => {
    try {
      const d = normalizar(JSON.parse(await f.text()));
      if (!confirm('Trocar os dados deste aparelho pelos da cópia de segurança?')) return;
      replaceAll(d);
      toast('Cópia de segurança restaurada!');
    } catch { toast('Esse arquivo não é uma cópia do app Mari.'); }
  };

  return (
    <div className="page">
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn ghost small" onClick={onClose}>← Voltar</button>
      </div>
      <h1 className="title">Ajustes</h1>

      <div className="grp">Rotinas</div>
      {data.routines.map((r) => (
        <button key={r.id} className="card row" style={{ width: '100%', marginBottom: 8, textAlign: 'left' }} onClick={() => setRot(r)}>
          <div style={{ flex: 1 }}>
            <b style={{ fontSize: 17 }}>{r.name}</b>
            <div className="small">{r.steps.length} passos · {r.days.length === 7 ? 'todos os dias' : r.days.map((x) => DIAS_CURTOS[x].toLowerCase()).join(', ') || 'nenhum dia'}</div>
          </div>
          <span className="small">Editar ›</span>
        </button>
      ))}
      <button className="btn block" onClick={() => setRot({ id: uid(), name: '', days: [1, 2, 3, 4, 5], steps: [] })}>{Icon.mais} Nova rotina</button>

      <div className="grp">Você</div>
      <div className="card">
        <label className="field" style={{ marginTop: 0 }}><span>Nome no "Bom dia"</span>
          <input className="input" value={s.name} onChange={(e) => setS({ name: e.target.value })} />
        </label>
        <div className="field"><span>Cores</span>
          <div className="seg">
            {(['auto', 'claro', 'noite'] as const).map((t) => (
              <button key={t} className={s.theme === t ? 'on' : ''} onClick={() => setS({ theme: t })}>
                {t === 'auto' ? 'Automático' : t === 'claro' ? 'Dia' : 'Noite'}
              </button>
            ))}
          </div>
          <div className="small" style={{ margin: '6px 4px 0' }}>Automático: segue o modo escuro do iPhone.</div>
        </div>

      </div>

      <div className="grp">Avisos</div>
      <div className="card">
        <label className="row" style={{ justifyContent: 'space-between' }}>
          <b>Avisar na hora de cada passo, conta e compromisso</b>
          <input type="checkbox" checked={s.notify && avisoPermitido()} onChange={(e) => ligarAvisos(e.target.checked)}
            style={{ width: 28, height: 28, accentColor: 'var(--ocean)', flex: 'none' }} />
        </label>
        <label className="field"><span>Avisar das contas quantos dias antes?</span>
          <select className="input" value={s.billDaysBefore} onChange={(e) => setS({ billDaysBefore: Number(e.target.value) })}>
            {[0, 1, 2, 3, 5, 7].map((n) => <option key={n} value={n}>{n === 0 ? 'Só no dia' : `${n} ${n === 1 ? 'dia' : 'dias'} antes`}</option>)}
          </select>
        </label>
        {!avisoSuportado() && (
          <p className="small" style={{ marginTop: 10 }}>
            Para receber avisos no iPhone, primeiro instale o app: no Safari, toque em Compartilhar (□↑) → "Adicionar à Tela de Início" e abra o Mari pelo ícone.
          </p>
        )}
        <p className="small" style={{ marginTop: 10 }}>
          Estes avisos chegam com o app aberto ou aberto há pouco. Para alarmes que tocam sempre, mesmo com o app fechado, use o Calendário do iPhone:
        </p>
        <button className="btn block" style={{ marginTop: 10 }} onClick={() => setCal(true)}>📅 Lembretes no Calendário do iPhone</button>
      </div>

      <div className="grp">Cópia de segurança</div>
      <div className="card">
        <p className="small">Seus dados ficam só neste celular. Faça uma cópia de vez em quando e guarde no iCloud Drive (ou mande para alguém de confiança).</p>
        <button className="btn primary block" style={{ marginTop: 12 }}
          onClick={() => baixar(`mari-copia-${ymd(new Date())}.json`, JSON.stringify(getData(), null, 1), 'application/json')}>
          Fazer cópia de segurança
        </button>
        <button className="btn block" style={{ marginTop: 8 }} onClick={() => fileRef.current?.click()}>Restaurar uma cópia</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importar(f); e.target.value = ''; }} />
      </div>

      <div style={{ textAlign: 'center', marginTop: 30 }}>
        <Baleia q="principal" w={120} style={{ margin: '0 auto 6px' }} />
        <div className="small">Mari · feito com carinho 🐋</div>
      </div>

      {rot && <RotinaForm r={rot} onClose={() => setRot(null)} />}
      {cal && (
        <Sheet title="Calendário do iPhone" onClose={() => setCal(false)}>
          <p style={{ marginTop: 6 }}>O Calendário do iPhone toca o alerta mesmo com o app fechado. Ele recebe uma cópia de tudo: passos das rotinas, contas e compromissos.</p>
          <ol style={{ margin: '14px 0 0 20px', display: 'grid', gap: 8 }}>
            <li>Toque em <b>Gerar lembretes</b> e depois em <b>Adicionar tudo</b>.</li>
            <li>Escolha um calendário só para o Mari (crie um chamado "Mari" no app Calendário).</li>
            <li><b>Mudou a rotina?</b> No app Calendário, apague o calendário "Mari" e gere de novo aqui. Assim nada fica repetido.</li>
          </ol>
          <button className="btn primary block" style={{ marginTop: 18 }} onClick={() => baixar('mari-lembretes.ics', gerarIcs(getData()), 'text/calendar')}>Gerar lembretes</button>
        </Sheet>
      )}
    </div>
  );
}

function RotinaForm({ r, onClose }: { r: Routine; onClose: () => void }) {
  const novo = !getData().routines.some((x) => x.id === r.id);
  const [f, setF] = useState<Routine>(structuredClone(r));
  const setStep = (id: string, p: Partial<Step>) => setF((x) => ({ ...x, steps: x.steps.map((s) => (s.id === id ? { ...s, ...p } : s)) }));
  const addStep = () => setF((x) => {
    const ult = x.steps[x.steps.length - 1];
    const time = ult ? fromMin(Math.min(23 * 60 + 50, toMin(ult.time) + ult.minutes)) : '08:00';
    return { ...x, steps: [...x.steps, { id: uid(), title: '', time, minutes: 15, substeps: [] }] };
  });

  const salvar = () => {
    if (!f.name.trim()) { toast('Dê um nome para a rotina.'); return; }
    const steps = f.steps
      .map((s) => ({ ...s, title: s.title.trim(), substeps: s.substeps.map((x) => x.trim()).filter(Boolean), minutes: Math.max(1, Math.min(600, s.minutes || 1)) }))
      .filter((s) => s.title)
      .sort((a, b) => toMin(a.time) - toMin(b.time));
    update((d) => {
      const pronto = { ...f, name: f.name.trim(), steps };
      const i = d.routines.findIndex((x) => x.id === f.id);
      if (i >= 0) d.routines[i] = pronto; else d.routines.push(pronto);
    });
    onClose();
  };
  const apagar = () => {
    if (!confirm(`Apagar a "${f.name}"?`)) return;
    update((d) => { d.routines = d.routines.filter((x) => x.id !== f.id); });
    onClose();
  };

  return (
    <Sheet title={novo ? 'Nova rotina' : 'Editar rotina'} onClose={onClose}>
      <label className="field"><span>Nome</span>
        <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Rotina da manhã" />
      </label>
      <div className="field"><span>Em quais dias?</span>
        <div className="daypick">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <button key={d} className={f.days.includes(d) ? 'on' : ''}
              onClick={() => setF({ ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d] })}>
              {DIAS_CURTOS[d]}
            </button>
          ))}
        </div>
      </div>

      <div className="field"><span>Passos</span></div>
      {f.steps.map((s, i) => (
        <div key={s.id} className="card stepedit">
          <div className="row">
            <b className="small" style={{ flex: 1 }}>Passo {i + 1}</b>
            <button className="btn ghost small" onClick={() => setF({ ...f, steps: f.steps.filter((x) => x.id !== s.id) })}>Tirar</button>
          </div>
          <input className="input" style={{ marginTop: 8 }} value={s.title} placeholder="O que fazer" onChange={(e) => setStep(s.id, { title: e.target.value })} />
          <div className="row" style={{ marginTop: 8 }}>
            <label style={{ flex: 1 }}><span className="small">Começa</span>
              <input className="input" type="time" value={s.time} onChange={(e) => e.target.value && setStep(s.id, { time: e.target.value })} />
            </label>
            <label style={{ flex: 1 }}><span className="small">Duração (min)</span>
              <input className="input" inputMode="numeric" value={s.minutes || ''} onChange={(e) => setStep(s.id, { minutes: Number(e.target.value.replace(/\D/g, '')) })} />
            </label>
          </div>
          <label style={{ display: 'block', marginTop: 8 }}><span className="small">Pedacinhos do passo (um por linha, opcional)</span>
            <textarea className="input" value={s.substeps.join('\n')} placeholder={'Ex.:\nSeparar a roupa\nPegar a toalha'}
              onChange={(e) => setStep(s.id, { substeps: e.target.value.split('\n') })} />
          </label>
        </div>
      ))}
      <button className="btn block" onClick={addStep}>{Icon.mais} Adicionar passo</button>
      <button className="btn primary block" style={{ marginTop: 18 }} onClick={salvar}>Salvar rotina</button>
      {!novo && <button className="btn danger block" style={{ marginTop: 10 }} onClick={apagar}>Apagar rotina</button>}
    </Sheet>
  );
}
