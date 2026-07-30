import { useEffect, useState } from 'react';
import { useCart } from '../lib/cart';
import { getPending, setPending, type Pending } from '../lib/pending';
import type { StoreId } from '../lib/store';

/**
 * Pop-up ao sair de uma categoria com itens marcados e não salvos.
 * Captura a seleção no instante da troca de rota (antes da próxima tela
 * montar e limpar), e pergunta se quer salvar no carrinho — para a
 * pessoa não perder o que marcou ao avançar para a próxima categoria.
 */
export function SaveGuard({ store }: { store: StoreId | null }) {
  const cart = useCart(store);
  const [snap, setSnap] = useState<Pending | null>(null);

  useEffect(() => {
    const onHash = () => {
      const p = getPending();
      if (p && p.items.length > 0) {
        setSnap(p);
        setPending(null); // consome, para não reabrir
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (!snap) return null;
  const n = snap.items.length;

  return (
    <div className="scrim modal-scrim" onClick={() => setSnap(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Salvar seleção?</h3>
        <p>
          Você marcou <strong>{n} {n === 1 ? 'produto' : 'produtos'}</strong> em{' '}
          <strong>{snap.categoria}</strong>. Salvar no carrinho antes de continuar?
        </p>
        <div className="modal-actions">
          <button className="secondary" onClick={() => setSnap(null)}>Descartar</button>
          <button
            className="primary"
            onClick={() => { cart.addMany(snap.items); setSnap(null); }}
          >
            Salvar {n} no carrinho
          </button>
        </div>
      </div>
    </div>
  );
}
