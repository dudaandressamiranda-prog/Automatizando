import { useState } from 'react';
import {
  useData, Data, addDays, ymd, DIAS_CURTOS, DIAS, MESES, stepsDoDia, contasDoMes, tarefasDoDia, fromMin, reais,
} from './store';
import { Baleia } from './ui';
import type { Tab } from './Hoje';

type Item = { h: string; cls: string; titulo: string; info: string; feito?: boolean; vai: Tab };

function itensDoDia(data: Data, dia: Date): Item[] {
  const out: Item[] = [];
  const steps = stepsDoDia(data, dia);
  const porRotina = new Map<string, typeof steps>();
  for (const s of steps) porRotina.set(s.routineId, [...(porRotina.get(s.routineId) || []), s]);
  for (const l of porRotina.values()) {
    out.push({
      h: l[0].time, cls: 'rot', titulo: l[0].routineName,
      info: `${l.length} ${l.length === 1 ? 'passo' : 'passos'} · até ${fromMin(Math.max(...l.map((s) => s.end)))}`, vai: 'hoje',
    });
  }
  const key = ymd(dia);
  for (const c of contasDoMes(data, dia.getFullYear(), dia.getMonth())) {
    if (ymd(c.due) !== key) continue;
    out.push({ h: 'dia', cls: 'conta', titulo: `Pagar ${c.bill.name}`, info: [reais(c.bill.amount), c.paidAt ? 'paga ✓' : ''].filter(Boolean).join(' · ') || 'conta', feito: !!c.paidAt, vai: 'contas' });
  }
  for (const t of tarefasDoDia(data, key)) {
    out.push({
      h: t.time || 'dia', cls: t.kind === 'compromisso' ? 'comp' : 'tar', titulo: t.title,
      info: t.notes || (t.kind === 'compromisso' ? 'Compromisso' : t.priority === 'importante' ? 'Demanda · importante' : 'Demanda'),
      feito: !!t.doneAt, vai: 'demandas',
    });
  }
  return out.sort((a, b) => (a.h === 'dia' ? '00:00' : a.h).localeCompare(b.h === 'dia' ? '00:00' : b.h));
}

const COR: Record<string, string> = { rot: 'var(--sea)', conta: 'var(--lamp)', comp: 'var(--coral)', tar: 'var(--kelp)' };

export function Semana({ go }: { go: (t: Tab) => void }) {
  const data = useData();
  const hoje = new Date();
  const [sel, setSel] = useState(hoje);
  const seg = addDays(sel, -((sel.getDay() + 6) % 7)); // semana começa na segunda
  const dias = Array.from({ length: 7 }, (_, i) => addDays(seg, i));
  const itens = itensDoDia(data, sel);
  const amanha = addDays(hoje, 1);
  const extrasAmanha = itensDoDia(data, amanha).filter((i) => i.cls !== 'rot');
  const extrasHoje = itensDoDia(data, hoje).filter((i) => i.cls !== 'rot');

  return (
    <div className="page">
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
        <h1 className="title" style={{ margin: 0 }}>Sua semana</h1>
        <div className="row" style={{ gap: 6 }}>
          <button className="iconbtn" aria-label="Semana anterior" onClick={() => setSel(addDays(sel, -7))}>‹</button>
          <button className="iconbtn" aria-label="Próxima semana" onClick={() => setSel(addDays(sel, 7))}>›</button>
        </div>
      </div>
      <div className="small" style={{ margin: '4px 2px 12px' }}>
        {seg.getDate()} de {MESES[seg.getMonth()]} a {dias[6].getDate()} de {MESES[dias[6].getMonth()]}
        {ymd(seg) !== ymd(addDays(hoje, -((hoje.getDay() + 6) % 7))) && (
          <> · <button style={{ border: 0, background: 'none', color: 'var(--ink)', fontWeight: 800, textDecoration: 'underline' }} onClick={() => setSel(hoje)}>voltar para hoje</button></>
        )}
      </div>
      <div className="week">
        {dias.map((d) => {
          const tipos = [...new Set(itensDoDia(data, d).map((i) => i.cls))];
          const on = ymd(d) === ymd(sel);
          return (
            <button key={ymd(d)} className={'d' + (on ? ' on' : '') + (ymd(d) === ymd(hoje) ? ' hoje' : '')} onClick={() => setSel(d)}>
              <small>{DIAS_CURTOS[d.getDay()]}</small><b>{d.getDate()}</b>
              <div className="dots">{tipos.map((t) => <i key={t} style={{ background: on ? 'currentColor' : COR[t], opacity: on ? .85 : 1 }} />)}</div>
            </button>
          );
        })}
      </div>
      <div className="legend">
        <span><i style={{ background: COR.rot }} />Rotina</span><span><i style={{ background: COR.conta }} />Conta</span>
        <span><i style={{ background: COR.comp }} />Compromisso</span><span><i style={{ background: COR.tar }} />Demanda</span>
      </div>

      <div className="grp" style={{ marginTop: 6 }}>{ymd(sel) === ymd(hoje) ? 'Hoje' : DIAS[sel.getDay()]}, {sel.getDate()} de {MESES[sel.getMonth()]}</div>
      {itens.length === 0 ? (
        <div className="card vazio"><Baleia q="clara" w={140} /><h3>Dia livre</h3><p className="small">Nada marcado para este dia.</p></div>
      ) : itens.map((i, k) => (
        <div key={k} className="ag">
          <span className="h">{i.h}</span>
          <button className={'c ' + i.cls + (i.feito ? ' feito' : '')} onClick={() => go(i.vai)}>
            <b>{i.titulo}</b><span>{i.info}</span>
          </button>
        </div>
      ))}

      <div className="card row" style={{ marginTop: 14, gap: 12 }}>
        <Baleia q="cachecol" w={86} />
        <div style={{ flex: 1, fontSize: 15.5 }}>
          <b>Amanhã:</b>{' '}
          {extrasAmanha.length === 0 ? 'só a rotina. Dia tranquilo.'
            : `${extrasAmanha.length} ${extrasAmanha.length === 1 ? 'coisa' : 'coisas'} além da rotina${extrasAmanha.length < extrasHoje.length ? ' (mais leve que hoje)' : ''}: ${extrasAmanha.map((i) => i.titulo).slice(0, 3).join(', ')}.`}
        </div>
      </div>
    </div>
  );
}
