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
  /**
   * Quantidade already indicada ao selecionar para o carrinho. Só faz
   * sentido junto de `onQtyChange`; sem os dois, o card não mostra o
   * controle — é o caso da categorização em massa, que não lida com
   * quantidade nenhuma.
   */
  qty?: number;
  onQtyChange?: (id: string, qty: number) => void;
}

export function ProductCard({
  product: p, src, selectable, selected, onToggle, blockNav, destacado, qty, onQtyChange,
}: Props) {
  // Selecionar já é dizer "quero 1"; o controle só aparece depois, para
  // ajustar sem precisar abrir o carrinho — a etapa que este recurso corta.
  const mostrarQtd = selected && !blockNav && Boolean(onQtyChange);

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
        {mostrarQtd && (
          <div
            className="qtd pcard-qtd"
            // o card inteiro é um link (ou um botão, no modo em massa); sem
            // isto, tocar no controle também navegaria ou alternaria a seleção
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <button
              type="button"
              onClick={() => onQtyChange!(p.id, (qty ?? 1) - 1)}
              disabled={(qty ?? 1) <= 1}
              aria-label="Menos um"
            >
              −
            </button>
            <input
              type="number"
              min={1}
              value={qty ?? 1}
              aria-label={`Quantidade de ${p.name}`}
              onChange={(e) => onQtyChange!(p.id, Number(e.target.value))}
              onBlur={(e) => { if (!Number(e.target.value)) onQtyChange!(p.id, 1); }}
            />
            <button type="button" onClick={() => onQtyChange!(p.id, (qty ?? 1) + 1)} aria-label="Mais um">
              +
            </button>
          </div>
        )}
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
