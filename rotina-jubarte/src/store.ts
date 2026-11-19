// Dados do app Mari. Tudo fica guardado SÓ neste aparelho (localStorage).
import { useSyncExternalStore } from 'react';

export type Step = {
  id: string;
  title: string;
  time: string; // 'HH:MM'
  minutes: number; // duração
  substeps: string[];
};
export type Routine = {
  id: string;
  name: string;
  days: number[]; // 0 = domingo ... 6 = sábado
  steps: Step[];
};
export type Bill = {
  id: string;
  name: string;
  icon: string;
  amount: number | null;
  repeat: 'mensal' | 'unica';
  dueDay: number; // dia do mês (mensal)
  dueDate: string; // 'YYYY-MM-DD' (única)
  code: string; // código de barras ou Pix copia e cola
  notes: string;
  since: string; // 'YYYY-MM' do cadastro: meses antes disso não contam
};
export type Task = {
  id: string;
  kind: 'tarefa' | 'compromisso';
  title: string;
  date: string; // '' = sem data
  time: string; // '' = sem hora
  priority: 'importante' | 'normal' | 'pode-esperar';
  notes: string;
  doneAt: string | null;
};
export type Settings = {
  name: string;
  theme: 'auto' | 'claro' | 'noite';
  notify: boolean;
  billDaysBefore: number;
  textSize: number; // 1 = normal, 1.15 = grande, 1.3 = muito grande
};
export type Data = {
  v: 1;
  settings: Settings;
  routines: Routine[];
  bills: Bill[];
  paid: Record<string, string>; // `${billId}|${YYYY-MM}` -> data em que pagou
  tasks: Task[];
  doneSteps: Record<string, string[]>; // 'YYYY-MM-DD' -> ids de passos feitos
  doneSubs: Record<string, string[]>; // 'YYYY-MM-DD' -> `${stepId}#${i}`
};

const KEY = 'mari-dados-v1';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function exemplo(): Data {
  const dias = [0, 1, 2, 3, 4, 5, 6];
  const st = (title: string, time: string, minutes: number, substeps: string[] = []): Step => ({
    id: uid(), title, time, minutes, substeps,
  });
  return {
    v: 1,
    settings: { name: 'Mari', theme: 'auto', notify: false, billDaysBefore: 3, textSize: 1 },
    routines: [
      {
        id: uid(), name: 'Rotina da manhã', days: dias, steps: [
          st('Acordar e beber água', '07:00', 10),
          st('Tomar banho', '07:10', 20, ['Separar a roupa', 'Pegar a toalha']),
          st('Tomar café da manhã', '07:30', 30, ['Preparar o café', 'Comer sentada à mesa', 'Lavar a xícara']),
          st('Escovar os dentes', '08:00', 10),
        ],
      },
      {
        id: uid(), name: 'Rotina da noite', days: dias, steps: [
          st('Jantar', '19:30', 40),
          st('Separar a roupa de amanhã', '21:00', 15),
          st('Banho e pijama', '21:30', 30),
          st('Desligar telas e deitar', '22:30', 15),
        ],
      },
    ],
    bills: [],
    paid: {},
    tasks: [],
    doneSteps: {},
    doneSubs: {},
  };
}

function load(): Data {
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch { /* sem armazenamento */ }
  if (!raw) return exemplo();
  try {
    return normalizar(JSON.parse(raw));
  } catch (e) {
    // Nunca perder dados: guarda o que estava salvo antes de seguir.
    try { localStorage.setItem(KEY + '-reserva-' + Date.now(), raw); } catch { /* cheio */ }
    console.error('Mari: não consegui ler os dados salvos', e);
    return exemplo();
  }
}

function mesAtual() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

export function normalizar(d: any): Data {
  const base = exemplo();
  if (!d || typeof d !== 'object') return base;
  return {
    v: 1,
    settings: { ...base.settings, ...(d.settings || {}) },
    routines: Array.isArray(d.routines) ? d.routines : base.routines,
    bills: Array.isArray(d.bills) ? d.bills.map((b: Bill) => ({ ...b, since: b.since || mesAtual() })) : [],
    paid: d.paid && typeof d.paid === 'object' ? d.paid : {},
    tasks: Array.isArray(d.tasks) ? d.tasks : [],
    doneSteps: d.doneSteps && typeof d.doneSteps === 'object' ? d.doneSteps : {},
    doneSubs: d.doneSubs && typeof d.doneSubs === 'object' ? d.doneSubs : {},
  };
}

let state: Data = load();
const subs = new Set<() => void>();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* cheio ou bloqueado */ }
}

export function update(fn: (d: Data) => Data | void) {
  const copy: Data = structuredClone(state);
  const r = fn(copy);
  state = r ?? copy;
  limparAntigos(state);
  save();
  subs.forEach((s) => s());
}

export function replaceAll(d: Data) {
  state = normalizar(d);
  save();
  subs.forEach((s) => s());
}

export function getData() { return state; }

export function useData(): Data {
  return useSyncExternalStore(
    (cb) => { subs.add(cb); return () => subs.delete(cb); },
    () => state,
  );
}

// Guarda só os últimos 60 dias de passos feitos.
function limparAntigos(d: Data) {
  const lim = new Date(); lim.setDate(lim.getDate() - 60);
  const corte = ymd(lim);
  for (const k of Object.keys(d.doneSteps)) if (k < corte) delete d.doneSteps[k];
  for (const k of Object.keys(d.doneSubs)) if (k < corte) delete d.doneSubs[k];
}

// ---------- datas ----------
export const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const ym = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const parseYmd = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export const fromMin = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const diffDays = (a: Date, b: Date) =>
  Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime() -
    new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()) / 86400000);

export const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const DIAS_CURTOS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
  'setembro', 'outubro', 'novembro', 'dezembro'];

export function dataLonga(d: Date) {
  const dia = DIAS[d.getDay()];
  return `${dia}${d.getDay() > 0 && d.getDay() < 6 ? '-feira' : ''}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}
export function dataCurta(d: Date) {
  return `${DIAS_CURTOS[d.getDay()].toLowerCase()}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}
export function quando(d: Date, hoje = new Date()) {
  const n = diffDays(d, hoje);
  if (n === 0) return 'hoje';
  if (n === 1) return 'amanhã';
  if (n === -1) return 'ontem';
  if (n > 1 && n < 7) return `em ${n} dias`;
  if (n < -1) return `há ${-n} dias`;
  return dataCurta(d);
}
export const reais = (v: number | null) =>
  v == null ? '' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ---------- rotina do dia ----------
export type DayStep = Step & { routineId: string; routineName: string; start: number; end: number };

export function stepsDoDia(d: Data, dia: Date): DayStep[] {
  const out: DayStep[] = [];
  for (const r of d.routines) {
    if (!r.days.includes(dia.getDay())) continue;
    for (const s of r.steps) {
      const start = toMin(s.time);
      out.push({ ...s, routineId: r.id, routineName: r.name, start, end: start + Math.max(1, s.minutes) });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

// ---------- contas ----------
export type BillDue = { bill: Bill; due: Date; key: string; paidAt: string | null };

export function vencimentoNoMes(b: Bill, ano: number, mes: number): Date | null {
  if (b.repeat === 'unica') {
    if (!b.dueDate) return null;
    const d = parseYmd(b.dueDate);
    return d.getFullYear() === ano && d.getMonth() === mes ? d : null;
  }
  const ultimo = new Date(ano, mes + 1, 0).getDate();
  return new Date(ano, mes, Math.min(b.dueDay || 1, ultimo));
}

export function contasDoMes(d: Data, ano: number, mes: number): BillDue[] {
  const out: BillDue[] = [];
  for (const b of d.bills) {
    const due = vencimentoNoMes(b, ano, mes);
    if (!due) continue;
    if (b.repeat === 'mensal' && b.since && ym(due) < b.since) continue;
    const key = `${b.id}|${ym(due)}`;
    out.push({ bill: b, due, key, paidAt: d.paid[key] ?? null });
  }
  return out.sort((a, b) => a.due.getTime() - b.due.getTime());
}

// Contas em aberto que precisam de atenção (atrasadas dos últimos 2 meses + vencendo em breve).
export function contasAtencao(d: Data, hoje = new Date(), dias = d.settings.billDaysBefore): BillDue[] {
  const lista: BillDue[] = [];
  for (let k = -2; k <= 1; k++) {
    const m = new Date(hoje.getFullYear(), hoje.getMonth() + k, 1);
    for (const c of contasDoMes(d, m.getFullYear(), m.getMonth())) {
      if (c.paidAt) continue;
      const n = diffDays(c.due, hoje);
      if (n <= dias) lista.push(c);
    }
  }
  return lista.sort((a, b) => a.due.getTime() - b.due.getTime());
}

// ---------- demandas ----------
export function tarefasDoDia(d: Data, dia: string) {
  return d.tasks.filter((t) => t.date === dia)
    .sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
}
