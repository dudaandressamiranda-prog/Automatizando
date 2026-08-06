import { REASON_LABEL, type CartItemRow, type ItemReason, type ItemStatus } from '../lib/cart';

interface Props {
  item: CartItemRow;
  src: string | null;
  editable?: boolean;
  onChange?: (status: ItemStatus, reason: ItemReason | null) => void;
  onRemove?: () => void;
}

/** valor combinado do <select> → status + motivo */
const OPTIONS: { value: string; label: string }[] = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'reposto', label: '✓ Reposto' },
  { value: 'nao_reposto:fora_estoque', label: 'Fora de estoque' },
  { value: 'nao_reposto:sem_galpao', label: 'Não tem no galpão' },
  { value: 'nao_reposto:descontinuado', label: 'Não trabalhamos mais' },
  { value: 'nao_reposto:aguardando', label: 'Aguardando reposição' },
];

function currentValue(i: CartItemRow): string {
  if (i.status === 'nao_reposto') return `nao_reposto:${i.reason ?? 'fora_estoque'}`;
  return i.status;
}

/** Texto e cor do selo de status. */
function badge(i: CartItemRow): { text: string; cls: string } | null {
  if (i.status === 'reposto') return { text: 'Reposto', cls: 'rep-ok' };
  if (i.status === 'nao_reposto') return { text: i.reason ? REASON_LABEL[i.reason] : 'Não reposto', cls: 'rep-no' };
  return null; // pendente: sem selo
}

export function CartItemCard({ item, src, editable, onChange, onRemove }: Props) {
  const b = badge(item);
  const cls =
    item.status === 'reposto' ? 'is-reposto' : item.status === 'nao_reposto' ? 'is-naoreposto' : '';

  return (
    <li className={`cart-card ${cls}`}>
      <a href={`#/p/${item.product_id}`} className="cart-card-img">
        <span aria-hidden>🐾</span>
        {src && <img src={src} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
        {b && <span className={`rep-badge ${b.cls}`}>{b.text}</span>}
      </a>
      <div className="cart-card-body">
        <a href={`#/p/${item.product_id}`} className="cart-card-name" title={item.name}>{item.name}</a>
        {item.barcode && <span className="mono tiny muted">{item.barcode}</span>}

        {editable ? (
          <select
            className="rep-select"
            value={currentValue(item)}
            onChange={(e) => {
              const [st, rs] = e.target.value.split(':');
              onChange?.(st as ItemStatus, (rs as ItemReason) ?? null);
            }}
          >
            {OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          !b && <span className="tiny muted">Pendente</span>
        )}
      </div>
      {onRemove && <button className="cart-del" onClick={onRemove} aria-label="Remover">✕</button>}
    </li>
  );
}
