import { useMemo } from 'react';
import {
  useData, update, stepsDoDia, ymd, dataLonga, fromMin, contasAtencao, diffDays, quando, reais,
  tarefasDoDia, DayStep,
} from './store';
import { Baleia, Check, Ring, useNow, Icon, desfazer } from './ui';

export type Tab = 'hoje' | 'contas' | 'demandas' | 'semana';

export function toggleStep(dia: string, id: string) {
  update((d) => {
    const l = new Set(d.doneSteps[dia] || []);
    l.has(id) ? l.delete(id) : l.add(id);
    d.doneSteps[dia] = [...l];
  });
}
export function toggleTask(id: string) {
  let feito = false, nome = '';
  update((d) => {
    const t = d.tasks.find((x) => x.id === id);
    if (t) { t.doneAt = t.doneAt ? null : new Date().toISOString(); feito = !!t.doneAt; nome = t.title; }
  });
  if (feito) desfazer(`Feito: ${nome}`, () => update((d) => { const t = d.tasks.find((x) => x.id === id); if (t) t.doneAt = null; }));
}

/** Qual passo mostrar no cartão grande: o de agora, ou o próximo. */
export function passoAtual(steps: DayStep[], done: Set<string>, min: number) {
  const agora = steps.find((s) => !done.has(s.id) && s.start <= min && min < s.end);
  if (agora) return { tipo: 'agora' as const, step: agora };
  const prox = steps.find((s) => !done.has(s.id) && s.start > min);
  if (prox) return { tipo: 'proximo' as const, step: prox };
  return null;
}

function saudacao(h: number) {
  if (h < 5) return 'Boa noite';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function Hoje({ go, openFoco, openAjustes }: {
  go: (t: Tab) => void; openFoco: (stepId: string) => void; openAjustes: () => void;
}) {
  const data = useData();
  const now = useNow();
  const dia = ymd(now);
  const min = now.getHours() * 60 + now.getMinutes();
  const steps = useMemo(() => stepsDoDia(data, now), [data, dia]); // eslint-disable-line
  const done = new Set(data.doneSteps[dia] || []);
  const atual = passoAtual(steps, done, min);
  const depois = atual ? steps.find((s) => !done.has(s.id) && s.start > atual.step.start && s.id !== atual.step.id) : null;
  const contas = contasAtencao(data, now);
  const tarefas = tarefasDoDia(data, dia);
  const atrasadas = data.tasks.filter((t) => !t.doneAt && t.date && t.date < dia);
  const tudoFeito = steps.length > 0 && steps.every((s) => done.has(s.id));
  const noite = now.getHours() >= 19 || now.getHours() < 5;

  let restante = 0, frac = 0;
  if (atual?.tipo === 'agora') {
    restante = atual.step.end - min;
    frac = restante / (atual.step.end - atual.step.start);
  } else if (atual) {
    restante = atual.step.start - min;
    frac = Math.min(1, restante / 60);
  }
  const rotLabel = restante >= 60 ? `${Math.floor(restante / 60)}h` : String(restante);
  const rotSub = restante >= 60 ? (restante % 60 ? `${restante % 60} min` : '') : 'min';

  return (
    <div className="page">
      <div className="hello">
        <div>
          <div className="small">{dataLonga(now)}</div>
          <h1>{saudacao(now.getHours())}{data.settings.name ? `, ${data.settings.name}` : ''}!</h1>
        </div>
        <div className="row" style={{ gap: 4, alignItems: 'flex-start' }}>
          <Baleia q={noite ? 'cachecol' : 'principal'} w={96} className="swim" />
          <button className="iconbtn" aria-label="Ajustes" onClick={openAjustes} style={{ marginTop: -4 }}>{Icon.ajustes}</button>
        </div>
      </div>

      {atual ? (
        <div className="now waves">
          <div className="lbl">{atual.tipo === 'agora' ? 'AGORA' : 'PRÓXIMO'}</div>
          <h2>{atual.step.title}</h2>
          <div style={{ color: 'var(--onocean2)', fontSize: 15.5 }}>
            {atual.tipo === 'agora'
              ? `${atual.step.time} até ${fromMin(atual.step.end)}`
              : `começa às ${atual.step.time}`}
          </div>
          <Ring frac={frac} label={rotLabel} sub={rotSub} />
          <div className="acts">
            <button className="btn feito" onClick={() => {
              const id = atual.step.id;
              toggleStep(dia, id);
              desfazer(`Feito: ${atual.step.title}`, () => toggleStep(dia, id));
            }}>✓ Feito</button>
            <button className="btn alt" onClick={() => openFoco(atual.step.id)}>Passo a passo</button>
          </div>
        </div>
      ) : tudoFeito ? (
        <div className="card vazio">
          <Baleia q="cachecol" w={170} className="swim" />
          <h3>Dia concluído!</h3>
          <p className="small">Você fez tudo da rotina de hoje. Pode descansar.</p>
        </div>
      ) : steps.length === 0 ? (
        <div className="card vazio">
          <Baleia q="clara" w={150} />
          <h3>Hoje não tem rotina</h3>
          <p className="small">Dia livre. Para montar uma rotina, toque na engrenagem lá em cima.</p>
        </div>
      ) : (
        <div className="card vazio">
          <Baleia q="cachecol" w={150} />
          <h3>Acabaram os horários de hoje</h3>
          <p className="small">Se ficou alguma coisa sem marcar, tudo bem. Amanhã é um novo dia.</p>
        </div>
      )}

      {depois && (
        <div className="depois"><b>DEPOIS</b> {depois.time} · {depois.title}</div>
      )}

      {contas.slice(0, 3).map((c) => {
        const n = diffDays(c.due, now);
        const atrasada = n < 0;
        return (
          <button key={c.key} className={'card alerta ' + (atrasada ? 'coral' : 'lamp')} onClick={() => go('contas')}>
            <div className="ico" style={{ background: 'rgba(255,255,255,.55)' }}>{c.bill.icon || '🧾'}</div>
            <div style={{ flex: 1 }}>
              <b style={{ fontSize: 16.5 }}>
                {c.bill.name} {atrasada ? `venceu ${quando(c.due, now)}` : n === 0 ? 'vence hoje' : `vence ${quando(c.due, now)}`}
              </b>
              <div className="small">{reais(c.bill.amount)}{c.bill.amount != null ? ' · ' : ''}toque para ver</div>
            </div>
          </button>
        );
      })}

      {(tarefas.length > 0 || atrasadas.length > 0) && (
        <>
          <div className="grp">Demandas de hoje</div>
          <div className="card tl">
            {[...atrasadas, ...tarefas].map((t) => (
              <button key={t.id} className={'t' + (t.doneAt ? ' done' : '')} aria-pressed={t.kind === 'tarefa' ? !!t.doneAt : undefined}
                onClick={() => t.kind === 'tarefa' ? toggleTask(t.id) : go('demandas')}>
                <span className="h">{t.time || (t.date < dia ? '!' : '—')}</span>
                <span className="tx">{t.title}
                  <small>{t.kind === 'compromisso' ? 'Compromisso' : t.date < dia ? `Ficou de ${quando(new Date(t.date + 'T12:00'), now)}` : t.priority === 'importante' ? 'Importante' : 'Demanda'}</small>
                </span>
                {t.kind === 'tarefa' && <Check on={!!t.doneAt} label={t.title} />}
              </button>
            ))}
          </div>
        </>
      )}

      {steps.length > 0 && (
        <>
          <div className="grp">Rotina de hoje</div>
          <div className="card tl">
            {steps.map((s, i) => {
              const feito = done.has(s.id);
              const cur = atual?.step.id === s.id;
              const novaRotina = i === 0 || steps[i - 1].routineId !== s.routineId;
              return (
                <div key={s.id}>
                  {novaRotina && i > 0 && <div style={{ height: 8 }} />}
                  <button className={'t' + (feito ? ' done' : '') + (cur ? ' cur' : '')} aria-pressed={feito} onClick={() => toggleStep(dia, s.id)}>
                    <span className="h" style={cur ? { color: 'var(--ink)' } : undefined}>{s.time}</span>
                    <span className="tx">{cur ? <b>{s.title}</b> : s.title}
                      {novaRotina && <small>{s.routineName}</small>}
                    </span>
                    <Check on={feito} label={s.title} />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
