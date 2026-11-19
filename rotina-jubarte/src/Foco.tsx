import { useEffect, useMemo, useState } from 'react';
import { useData, update, stepsDoDia, ymd, fromMin } from './store';
import { Baleia, Check, Ring } from './ui';

/** Passo a passo: uma coisa de cada vez, com tempo em círculo e a baleia nadando pelas etapas. */
export function Foco({ stepId, onClose }: { stepId: string; onClose: () => void }) {
  const data = useData();
  const hoje = new Date();
  const dia = ymd(hoje);
  const todos = useMemo(() => stepsDoDia(data, hoje), [data, dia]); // eslint-disable-line
  const [atualId, setAtualId] = useState(stepId);
  const step = todos.find((s) => s.id === atualId);
  const rotina = todos.filter((s) => s.routineId === step?.routineId);
  const idx = rotina.findIndex((s) => s.id === atualId);
  const done = new Set(data.doneSteps[dia] || []);
  const subsDone = new Set(data.doneSubs[dia] || []);
  const [fim, setFim] = useState(false);

  // Cronômetro: começa com a duração do passo; pode pausar.
  const total = Math.max(1, step?.minutes || 1) * 60;
  const inicial = () => {
    if (!step) return total;
    const n = new Date();
    const seg = n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds();
    const dentro = seg >= step.start * 60 && seg < step.end * 60;
    return dentro ? Math.min(total, step.end * 60 - seg) : total;
  };
  const [restam, setRestam] = useState(inicial);
  const [pausado, setPausado] = useState(false);
  useEffect(() => { setRestam(inicial()); setPausado(false); }, [atualId]); // eslint-disable-line
  useEffect(() => {
    if (pausado || fim) return;
    let last = Date.now();
    const t = window.setInterval(() => {
      const n = Date.now();
      setRestam((r) => Math.max(0, r - Math.round((n - last) / 1000)));
      last = n;
    }, 1000);
    return () => clearInterval(t);
  }, [pausado, fim, atualId]);

  // Tela acesa enquanto está no passo a passo (quando o aparelho permite).
  useEffect(() => {
    let lock: any;
    (navigator as any).wakeLock?.request('screen').then((l: any) => { lock = l; }).catch(() => {});
    return () => { lock?.release?.(); };
  }, []);

  if (!step) {
    return (
      <div className="page focus">
        <button className="btn ghost small" onClick={onClose}>← Voltar</button>
        <p style={{ marginTop: 20 }}>Esse passo não está na rotina de hoje.</p>
      </div>
    );
  }

  const toggleSub = (i: number) => update((d) => {
    const k = `${step.id}#${i}`;
    const l = new Set(d.doneSubs[dia] || []);
    l.has(k) ? l.delete(k) : l.add(k);
    d.doneSubs[dia] = [...l];
  });

  const terminei = () => {
    update((d) => {
      const l = new Set(d.doneSteps[dia] || []);
      l.add(step.id);
      d.doneSteps[dia] = [...l];
    });
    const prox = rotina.slice(idx + 1).find((s) => !done.has(s.id));
    if (prox) setAtualId(prox.id); else setFim(true);
  };

  const proximo = rotina.slice(idx + 1).find((s) => !done.has(s.id));
  const mm = Math.floor(restam / 60), ss = restam % 60;

  if (fim) {
    return (
      <div className="page focus" style={{ textAlign: 'center', paddingTop: 'calc(env(safe-area-inset-top) + 60px)' }}>
        <Baleia q="dourada" w={240} className="swim" style={{ margin: '0 auto' }} />
        <h1 className="title" style={{ fontSize: 34, marginTop: 20 }}>{step.routineName} concluída!</h1>
        <p className="small" style={{ fontSize: 17, marginBottom: 28 }}>Você fez todos os passos. Muito bem.</p>
        <button className="btn primary block" onClick={onClose}>Voltar para Hoje</button>
      </div>
    );
  }

  // Linha de progresso: uma bolinha por passo, a baleia na etapa atual.
  const W = 340, n = rotina.length, x = (i: number) => (n <= 1 ? W / 2 : 10 + (i * (W - 20)) / (n - 1));
  const wx = x(idx);

  return (
    <div className="page focus">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button className="btn ghost small" onClick={onClose}>← Voltar</button>
        <span className="chip sea">{step.routineName}</span>
      </div>

      <svg className="depth" width="100%" viewBox={`0 0 ${W} 70`} aria-hidden>
        <line x1={x(0)} y1="48" x2={x(n - 1)} y2="48" stroke="var(--line)" strokeWidth="6" strokeLinecap="round" />
        <line x1={x(0)} y1="48" x2={wx} y2="48" stroke="var(--sea)" strokeWidth="6" strokeLinecap="round" />
        {rotina.map((s, i) => (
          <circle key={s.id} cx={x(i)} cy="48" r="7" fill={done.has(s.id) || i < idx ? 'var(--sea)' : 'var(--line)'} />
        ))}
        <image href="./baleias/clara.webp" x={-(wx + 44)} y="2" width="88" height="57" transform="scale(-1,1)" />
      </svg>

      <div className="small" style={{ fontWeight: 800 }}>Passo {idx + 1} de {n}</div>
      <h1 className="stepbig">{step.title}</h1>

      <div className="card timer">
        <Ring frac={restam / total} size={78} track="var(--line)" color="var(--ring)" />
        <div>
          <div className="serif" style={{ fontSize: 30 }}>{restam === 0 ? 'Tempo acabou' : `${mm}:${String(ss).padStart(2, '0')}`}</div>
          <div className="small">{pausado ? 'pausado' : `sem pressa · no plano até ${fromMin(step.end)}`}</div>
        </div>
      </div>

      {step.substeps.map((t, i) => {
        const on = subsDone.has(`${step.id}#${i}`);
        return (
          <button key={i} className={'sub' + (on ? ' done' : '')} onClick={() => toggleSub(i)}>
            <Check on={on} label={t} /><span>{t}</span>
          </button>
        );
      })}

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn" onClick={() => setPausado((p) => !p)}>{pausado ? 'Continuar' : 'Pausar'}</button>
        <button className="btn primary" style={{ flex: 1 }} onClick={terminei}>✓ Terminei</button>
      </div>
      <p className="small" style={{ textAlign: 'center', marginTop: 14, fontSize: 15.5 }}>
        {proximo ? <>Depois vem: <b style={{ color: 'var(--ink)' }}>{proximo.title}</b></> : 'Este é o último passo.'}
      </p>
    </div>
  );
}
