// Avisos (notificações) e lembretes no Calendário do iPhone.
import { getData, stepsDoDia, ymd, toMin, contasAtencao, diffDays, reais, pad, Data, parseYmd } from './store';

const KEY = 'mari-avisados';

export const avisoSuportado = () => 'Notification' in window && 'serviceWorker' in navigator;
export const avisoPermitido = () => avisoSuportado() && Notification.permission === 'granted';

export async function pedirPermissao(): Promise<boolean> {
  if (!avisoSuportado()) return false;
  const r = await Notification.requestPermission();
  return r === 'granted';
}

async function mostrar(titulo: string, corpo: string, tag: string) {
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(titulo, { body: corpo, tag, icon: './icons/icon-192.png', badge: './icons/icon-192.png' });
  } catch {
    try { new Notification(titulo, { body: corpo, tag }); } catch { /* sem aviso */ }
  }
}

/** Confere a cada 20 s, com o app aberto, se chegou a hora de algum aviso. */
export function iniciarAvisos() {
  const tick = () => {
    const d = getData();
    if (!d.settings.notify || !avisoPermitido()) return;
    const agora = new Date();
    const dia = ymd(agora);
    const min = agora.getHours() * 60 + agora.getMinutes();
    let feitos: Record<string, string> = {};
    try { feitos = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* vazio */ }
    for (const k of Object.keys(feitos)) if (!k.startsWith(dia)) delete feitos[k];
    const avisar = (id: string, t: string, c: string) => {
      const k = `${dia}|${id}`;
      if (feitos[k]) return;
      feitos[k] = '1';
      mostrar(t, c, id);
    };
    const done = new Set(d.doneSteps[dia] || []);
    for (const s of stepsDoDia(d, agora)) {
      if (!done.has(s.id) && min >= s.start && min < s.start + 5) {
        avisar('p' + s.id, `🐋 Agora: ${s.title}`, `${s.routineName} · ${s.minutes} min`);
      }
    }
    for (const t of d.tasks) {
      if (t.doneAt || t.date !== dia || !t.time) continue;
      const m = toMin(t.time);
      if (t.kind === 'compromisso' && min >= m - 60 && min < m - 55) avisar('c1' + t.id, `🐋 Daqui a 1 hora: ${t.title}`, t.notes || `Às ${t.time}`);
      if (min >= m && min < m + 5) avisar('t' + t.id, `🐋 ${t.title}`, t.notes || (t.kind === 'compromisso' ? 'Compromisso agora' : 'Hora desta demanda'));
    }
    if (min >= 9 * 60) {
      for (const c of contasAtencao(d, agora)) {
        const n = diffDays(c.due, agora);
        avisar('b' + c.key, `🐋 Conta: ${c.bill.name}`,
          `${n < 0 ? 'Venceu' : n === 0 ? 'Vence hoje' : n === 1 ? 'Vence amanhã' : `Vence em ${n} dias`}${c.bill.amount != null ? ' · ' + reais(c.bill.amount) : ''}`);
      }
    }
    try { localStorage.setItem(KEY, JSON.stringify(feitos)); } catch { /* ok */ }
  };
  tick();
  window.setInterval(tick, 20000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && tick());
}

// ---------- Calendário do iPhone (.ics) ----------
const BY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const stamp = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const dstr = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

export function gerarIcs(d: Data): string {
  const hoje = new Date();
  const L: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mari//Rotina//PT', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Mari'];
  const ev = (uid: string, titulo: string, inicio: string, fim: string, rrule: string | null, alarme: string, desc = '') => {
    L.push('BEGIN:VEVENT', `UID:${uid}@mari`, `DTSTAMP:${stamp(hoje)}`, inicio, fim, `SUMMARY:${esc(titulo)}`);
    if (desc) L.push(`DESCRIPTION:${esc(desc)}`);
    if (rrule) L.push(rrule);
    L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(titulo)}`, `TRIGGER:${alarme}`, 'END:VALARM', 'END:VEVENT');
  };
  for (const r of d.routines) {
    if (!r.days.length) continue;
    for (const s of r.steps) {
      const [h, m] = s.time.split(':').map(Number);
      const ini = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), h, m);
      const fim = new Date(ini.getTime() + Math.max(1, s.minutes) * 60000);
      ev(`passo-${s.id}`, `🐋 ${s.title}`, `DTSTART:${stamp(ini)}`, `DTEND:${stamp(fim)}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${r.days.map((x) => BY[x]).join(',')}`, 'PT0M',
        [r.name, ...s.substeps.map((x) => '• ' + x)].join('\n'));
    }
  }
  for (const b of d.bills) {
    const dias = Math.max(0, d.settings.billDaysBefore);
    if (b.repeat === 'mensal') {
      const dia = b.dueDay || 1;
      const ini = new Date(hoje.getFullYear(), hoje.getMonth(), Math.min(dia, 28));
      const regra = dia > 28
        ? `RRULE:FREQ=MONTHLY;BYMONTHDAY=${Array.from({ length: dia - 27 }, (_, i) => 28 + i).join(',')};BYSETPOS=-1`
        : `RRULE:FREQ=MONTHLY;BYMONTHDAY=${dia}`;
      // conta: evento de dia inteiro com aviso às 9h, X dias antes e no dia
      ev(`conta-${b.id}`, `🧾 Pagar ${b.name}`, `DTSTART;VALUE=DATE:${dstr(ini)}`, `DTEND;VALUE=DATE:${dstr(new Date(ini.getTime() + 86400000))}`,
        regra, dias > 0 ? `-P${dias - 1}DT15H` : 'PT9H', b.amount != null ? reais(b.amount) : '');
      // segundo aviso: no próprio dia, às 9h
      L.splice(L.lastIndexOf('END:VEVENT'), 0, 'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc('Vence hoje: ' + b.name)}`, 'TRIGGER:PT9H', 'END:VALARM');
    } else if (b.dueDate) {
      const ini = parseYmd(b.dueDate);
      if (diffDays(ini, hoje) < 0) continue;
      ev(`conta-${b.id}`, `🧾 Pagar ${b.name}`, `DTSTART;VALUE=DATE:${dstr(ini)}`, `DTEND;VALUE=DATE:${dstr(new Date(ini.getTime() + 86400000))}`,
        null, 'PT9H', b.amount != null ? reais(b.amount) : '');
    }
  }
  for (const t of d.tasks) {
    if (t.doneAt || !t.date || t.date < ymd(hoje)) continue;
    const base = parseYmd(t.date);
    if (t.time) {
      const [h, m] = t.time.split(':').map(Number);
      const ini = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m);
      ev(`tarefa-${t.id}`, `🐋 ${t.title}`, `DTSTART:${stamp(ini)}`, `DTEND:${stamp(new Date(ini.getTime() + 3600000))}`, null,
        t.kind === 'compromisso' ? '-PT60M' : 'PT0M', t.notes);
    } else {
      ev(`tarefa-${t.id}`, `🐋 ${t.title}`, `DTSTART;VALUE=DATE:${dstr(base)}`, `DTEND;VALUE=DATE:${dstr(new Date(base.getTime() + 86400000))}`, null, 'PT9H', t.notes);
    }
  }
  L.push('END:VCALENDAR');
  // linhas no padrão do calendário: CRLF e quebra a cada 73 caracteres
  return L.map((l) => {
    const out: string[] = [];
    let s = l;
    while (s.length > 73) { out.push(s.slice(0, 73)); s = ' ' + s.slice(73); }
    out.push(s);
    return out.join('\r\n');
  }).join('\r\n') + '\r\n';
}
