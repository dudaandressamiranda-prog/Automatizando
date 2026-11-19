import { useState } from 'react';
import { useData, update, uid, Task, ymd, parseYmd, quando } from './store';
import { Baleia, Check, Sheet, toast, Icon } from './ui';
import { toggleTask } from './Hoje';

const PRIO: Record<Task['priority'], string> = { importante: 'Importante', normal: 'Normal', 'pode-esperar': 'Pode esperar' };

export function Demandas() {
  const data = useData();
  const hoje = ymd(new Date());
  const [aba, setAba] = useState<'fazer' | 'feitas'>('fazer');
  const [edit, setEdit] = useState<Task | 'tarefa' | 'compromisso' | null>(null);
  const ord = (a: Task, b: Task) => (a.date || '9999').localeCompare(b.date || '9999') || (a.time || '99').localeCompare(b.time || '99')
    || prioN(a) - prioN(b);
  const abertas = data.tasks.filter((t) => !t.doneAt).sort(ord);
  const feitas = data.tasks.filter((t) => t.doneAt).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '')).slice(0, 50);

  const grupos: [string, Task[]][] = [
    ['Ficaram para trás', abertas.filter((t) => t.date && t.date < hoje)],
    ['Hoje', abertas.filter((t) => t.date === hoje)],
    ['Próximos dias', abertas.filter((t) => t.date > hoje)],
    ['Sem data', abertas.filter((t) => !t.date)],
  ];

  return (
    <div className="page">
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 6, gap: 8 }}>
        <button className="btn small" onClick={() => setEdit('compromisso')}>+ Compromisso</button>
        <button className="btn primary small" onClick={() => setEdit('tarefa')}>{Icon.mais} Demanda</button>
      </div>
      <h1 className="title">Demandas</h1>
      <div className="seg" style={{ marginBottom: 6 }}>
        <button className={aba === 'fazer' ? 'on' : ''} onClick={() => setAba('fazer')}>A fazer ({abertas.length})</button>
        <button className={aba === 'feitas' ? 'on' : ''} onClick={() => setAba('feitas')}>Feitas</button>
      </div>

      {aba === 'fazer' && abertas.length === 0 && (
        <div className="card vazio" style={{ marginTop: 12 }}>
          <Baleia q="clara" w={170} className="swim" />
          <h3>Nada pendente</h3>
          <p className="small">Quando aparecer alguma coisa para fazer, anote aqui para não precisar guardar na cabeça.</p>
        </div>
      )}
      {aba === 'fazer' && grupos.map(([nome, l]) => l.length > 0 && (
        <div key={nome}>
          <div className="grp">{nome}</div>
          {l.map((t) => <TaskRow key={t.id} t={t} hoje={hoje} onEdit={() => setEdit(t)} />)}
        </div>
      ))}
      {aba === 'feitas' && (feitas.length === 0
        ? <p className="small" style={{ margin: 20, textAlign: 'center' }}>As demandas feitas aparecem aqui.</p>
        : <div style={{ marginTop: 12 }}>{feitas.map((t) => <TaskRow key={t.id} t={t} hoje={hoje} onEdit={() => setEdit(t)} />)}</div>)}

      {edit && <TaskForm task={typeof edit === 'string' ? null : edit} kind={typeof edit === 'string' ? edit : edit.kind} onClose={() => setEdit(null)} />}
    </div>
  );
}

const prioN = (t: Task) => (t.priority === 'importante' ? 0 : t.priority === 'normal' ? 1 : 2);

function TaskRow({ t, hoje, onEdit }: { t: Task; hoje: string; onEdit: () => void }) {
  const comp = t.kind === 'compromisso';
  const info = [
    comp ? 'Compromisso' : null,
    t.date ? (t.date === hoje ? 'hoje' : quando(parseYmd(t.date))) : null,
    t.time || null,
    !comp && t.priority !== 'normal' ? PRIO[t.priority] : null,
  ].filter(Boolean).join(' · ');
  return (
    <div className={'card task' + (t.doneAt ? ' done' : '')}
      style={comp ? { borderLeft: '5px solid var(--coral)' } : t.priority === 'importante' ? { borderLeft: '5px solid var(--lamp)' } : undefined}>
      <Check on={!!t.doneAt} label={t.title} onClick={() => toggleTask(t.id)} />
      <button className="tx" style={{ background: 'none', border: 0, textAlign: 'left' }} onClick={onEdit}>
        <b>{t.title}</b>
        {info && <span className="small">{info[0].toUpperCase() + info.slice(1)}</span>}
        {t.notes && <span className="small" style={{ display: 'block' }}>{t.notes}</span>}
      </button>
    </div>
  );
}

function TaskForm({ task, kind, onClose }: { task: Task | null; kind: Task['kind']; onClose: () => void }) {
  const [f, setF] = useState<Task>(task ?? {
    id: uid(), kind, title: '', date: kind === 'compromisso' ? ymd(new Date()) : '', time: '',
    priority: 'normal', notes: '', doneAt: null,
  });
  const set = (p: Partial<Task>) => setF((x) => ({ ...x, ...p }));
  const comp = f.kind === 'compromisso';

  const salvar = () => {
    if (!f.title.trim()) { toast('Escreva o que é.'); return; }
    if (comp && !f.date) { toast('Compromisso precisa de data.'); return; }
    update((d) => {
      const pronto = { ...f, title: f.title.trim() };
      const i = d.tasks.findIndex((t) => t.id === f.id);
      if (i >= 0) d.tasks[i] = pronto; else d.tasks.push(pronto);
    });
    onClose();
  };
  const apagar = () => {
    if (!confirm(`Apagar "${f.title}"?`)) return;
    update((d) => { d.tasks = d.tasks.filter((t) => t.id !== f.id); });
    onClose();
  };

  return (
    <Sheet title={task ? 'Editar' : comp ? 'Novo compromisso' : 'Nova demanda'} onClose={onClose}>
      <label className="field"><span>{comp ? 'Compromisso' : 'O que precisa fazer?'}</span>
        <input className="input" value={f.title} onChange={(e) => set({ title: e.target.value })}
          placeholder={comp ? 'Ex.: Consulta com a dentista' : 'Ex.: Mandar e-mail para o RH'} />
      </label>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: 1.4 }}><span>Dia {comp ? '' : '(opcional)'}</span>
          <input className="input" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
        </label>
        <label className="field" style={{ flex: 1 }}><span>Hora</span>
          <input className="input" type="time" value={f.time} onChange={(e) => set({ time: e.target.value })} />
        </label>
      </div>
      {f.date && !comp && <button className="btn ghost small" style={{ marginTop: 8 }} onClick={() => set({ date: '', time: '' })}>Tirar a data</button>}
      {!comp && (
        <div className="field"><span>Prioridade</span>
          <div className="seg">
            {(Object.keys(PRIO) as Task['priority'][]).map((p) => (
              <button key={p} className={f.priority === p ? 'on' : ''} onClick={() => set({ priority: p })}>{PRIO[p]}</button>
            ))}
          </div>
        </div>
      )}
      <label className="field"><span>{comp ? 'O que levar / quando sair (opcional)' : 'Detalhes (opcional)'}</span>
        <textarea className="input" value={f.notes} onChange={(e) => set({ notes: e.target.value })}
          placeholder={comp ? 'Ex.: sair de casa às 9:30, levar documento' : ''} />
      </label>
      <button className="btn primary block" style={{ marginTop: 20 }} onClick={salvar}>Salvar</button>
      {task && <button className="btn danger block" style={{ marginTop: 10 }} onClick={apagar}>Apagar</button>}
    </Sheet>
  );
}
