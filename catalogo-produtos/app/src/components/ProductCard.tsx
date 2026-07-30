import type { ListProduct } from '../lib/types';
import { STATUS_LABEL } from '../lib/types';

interface Props {
  product: ListProduct;
  src: string | null;
  /** Bolinha de seleção (para montar o carrinho). */
  selectable?: boolean;
  selected?: boolean;
  onToggle?: (id: string) => void;
}

export function ProductCard({ product: p, src, selectable, selected, onToggle }: Props) {
  return (
    <a href={`#/p/${p.id}`} className={`pcard ${selected ? 'pcard-selected' : ''}`}>
      {selectable && (
        <button
          type="button"
          className={`pcard-pick ${selected ? 'on' : ''}`}
          aria-label={selected ? 'Remover da seleção' : 'Selecionar'}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggle?.(p.id);
          }}
        >
          {selected ? '✓' : ''}
        </button>
      )}
      <div className="pcard-img">
        <span aria-hidden>🐾</span>
        {src && (
          <img
            src={src}
            alt=""
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}
        {p.status !== 'ativo' && (
          <span className={`badge badge-${p.status} pcard-badge`}>{STATUS_LABEL[p.status]}</span>
        )}
      </div>
      <div className="pcard-body">
        <span className="pcard-name">{p.name}</span>
        {p.brand && <span className="muted small">{p.brand}</span>}
        {p.barcode && <span className="mono tiny muted">{p.barcode}</span>}
      </div>
    </a>
  );
}
