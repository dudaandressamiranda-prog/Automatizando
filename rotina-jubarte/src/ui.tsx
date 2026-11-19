import { ReactNode, useEffect, useRef, useState } from 'react';

export const BALEIA = {
  principal: './baleias/principal.webp',
  clara: './baleias/clara.webp',
  dourada: './baleias/dourada.webp',
  cachecol: './baleias/cachecol.webp',
};

export function Baleia({ q, w, flip, className, style }: {
  q: keyof typeof BALEIA; w: number; flip?: boolean; className?: string; style?: React.CSSProperties;
}) {
  return <img src={BALEIA[q]} alt="" width={w} className={className}
    style={{ width: w, height: 'auto', transform: flip ? 'scaleX(-1)' : undefined, ...style }} />;
}

/** Caudinha de baleia usada como "feito". */
export function Cauda({ size = 17 }: { size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden>
      <path fill="currentColor" d="M20 36 C20 26 20 20 18 16 C12 16 6 12 3 6 C9 7 15 9 20 13 C25 9 31 7 37 6 C34 12 28 16 22 16 C20 20 20 26 20 36Z" />
    </svg>
  );
}

/** Bolinha de marcar. Sem onClick ela é só o desenho (quem marca é o botão em volta). */
export function Check({ on, onClick, label }: { on: boolean; onClick?: () => void; label: string }) {
  if (!onClick) return <span aria-hidden className={'ck' + (on ? ' on' : '')}>{on && <Cauda />}</span>;
  return (
    <button type="button" role="checkbox" aria-checked={on} aria-label={label} className={'ck' + (on ? ' on' : '')}
      onClick={(e) => { e.stopPropagation(); onClick(); }}>
      {on && <Cauda />}
    </button>
  );
}

/** Círculo que esvazia conforme o tempo passa. */
export function Ring({ frac, size = 86, label, sub, track = 'var(--ocean2)', color = 'var(--ring)', text = 'var(--onocean)' }: {
  frac: number; size?: number; label?: string; sub?: string; track?: string; color?: string; text?: string;
}) {
  const r = 36, c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, frac));
  return (
    <svg className="ring" width={size} height={size} viewBox="0 0 86 86" aria-hidden>
      <circle cx="43" cy="43" r={r} fill="none" stroke={track} strokeWidth="9" />
      <circle cx="43" cy="43" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - f)} transform="rotate(-90 43 43)"
        style={{ transition: 'stroke-dashoffset .6s' }} />
      {label && <text x="43" y={sub ? 43 : 50} textAnchor="middle" fill={text} fontFamily="Fraunces, Georgia, serif" fontWeight="600" fontSize="22">{label}</text>}
      {sub && <text x="43" y="59" textAnchor="middle" fill={text} opacity=".75" fontSize="11" fontWeight="800">{sub}</text>}
    </svg>
  );
}

const PERGUNTA = 'Fechar sem salvar? O que você escreveu será perdido.';

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  // Se ela já digitou alguma coisa, tocar fora não fecha sem perguntar.
  const sujo = useRef(false);
  const fora = () => { if (!sujo.current || confirm(PERGUNTA)) onClose(); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && (!sujo.current || confirm(PERGUNTA)) && onClose();
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="sheet-bg" onClick={fora}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        onInput={() => { sujo.current = true; }} onChange={() => { sujo.current = true; }}>
        <div className="row" style={{ marginBottom: 6 }}>
          <h2 style={{ flex: 1 }}>{title}</h2>
          <button className="iconbtn" aria-label="Fechar" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

type Acao = { label: string; fn: () => void };
let toastFn: ((m: string, a?: Acao) => void) | null = null;
/** Aviso rápido embaixo. Com ação ("Desfazer"), fica mais tempo na tela. */
export const toast = (m: string, a?: Acao) => toastFn?.(m, a);
export const desfazer = (m: string, fn: () => void) => toast(m, { label: 'Desfazer', fn });
export function Toaster() {
  const [msg, setMsg] = useState<{ m: string; a?: Acao } | null>(null);
  useEffect(() => {
    let t: number;
    toastFn = (m, a) => { setMsg({ m, a }); clearTimeout(t); t = window.setTimeout(() => setMsg(null), a ? 6000 : 2600); };
    return () => { toastFn = null; };
  }, []);
  if (!msg) return null;
  return (
    <div className="toast" role="status">
      <span style={{ flex: 1 }}>{msg.m}</span>
      {msg.a && <button onClick={() => { msg.a!.fn(); setMsg(null); }}>{msg.a.label}</button>}
    </div>
  );
}

export async function copiar(texto: string) {
  try { await navigator.clipboard.writeText(texto); toast('Copiado!'); }
  catch { toast('Não consegui copiar. Segure o texto para copiar.'); }
}

/** Relógio que atualiza a cada 20 s (para o "Agora" andar sozinho). */
export function useNow(ms = 20000) {
  const [n, setN] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setN(new Date()), ms);
    const vis = () => document.visibilityState === 'visible' && setN(new Date());
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [ms]);
  return n;
}

export const Icon = {
  hoje: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" /></svg>,
  contas: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 10h18M7 15h4" /></svg>,
  demandas: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" /></svg>,
  semana: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>,
  ajustes: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>,
  mais: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
};
