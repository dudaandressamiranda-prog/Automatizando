import type { Product } from '../lib/types';
import { STATUS_LABEL } from '../lib/types';

interface Props {
  product: Product;
  src: string | null;
}

export function ProductCard({ product: p, src }: Props) {
  return (
    <a href={`#/p/${p.id}`} className="pcard">
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
