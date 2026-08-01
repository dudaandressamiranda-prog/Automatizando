import type { ListProduct } from '../lib/types';
import { STATUS_LABEL } from '../lib/types';

interface Props {
  product: ListProduct;
  src: string | null;
  /** Mostra a bolinha de seleção (montar carrinho ou categorizar em massa). */
  selectable?: boolean;
  selected?: boolean;
  onToggle?: (id: string) => void;
  /**
   * Categorização em massa: o card inteiro vira o alvo do clique (mais fácil
   * de acertar) e não abre o produto — só a seleção. Nos outros modos o
   * clique fora da bolinha continua abrindo o produto normalmente.
   */
  blockNav?: boolean;
  /** Realce passageiro de quem acabou de ser editado, para achar na lista. */
  destacado?: boolean;
}

export function ProductCard({ product: p, src, selectable, selected, onToggle, blockNav, destacado }: Props) {
  const media = (
    <>
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
        <span className="pcard-name" title={p.name}>{p.name}</span>
        {p.brand && <span className="muted small">{p.brand}</span>}
        {p.barcode && <span className="mono tiny muted">{p.barcode}</span>}
      </div>
    </>
  );

  if (blockNav) {
    return (
      <div
        id={`p-${p.id}`}
        className={`pcard pcard-block ${selected ? 'pcard-selected' : ''} ${destacado ? 'pcard-destaque' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => onToggle?.(p.id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle?.(p.id); }}
      >
        <span className={`pcard-pick ${selected ? 'on' : ''}`} aria-hidden="true">
          {selected ? '✓' : ''}
        </span>
        {media}
      </div>
    );
  }

  return (
    <a
      id={`p-${p.id}`}
      href={`#/p/${p.id}`}
      className={`pcard ${selected ? 'pcard-selected' : ''} ${destacado ? 'pcard-destaque' : ''}`}
    >
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
      {media}
    </a>
  );
}
