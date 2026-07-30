import { APP_NAME } from '../lib/config';
import { STORES, type StoreId } from '../lib/store';

interface Props {
  onChoose: (id: StoreId) => void;
  email?: string;
  onSignOut: () => void;
}

/** Tela pós-login para quem não tem loja fixa: escolhe em qual loja vai atuar. */
export function StorePicker({ onChoose, email, onSignOut }: Props) {
  return (
    <div className="store-pick">
      <div className="store-pick-inner">
        <img src="/logo.png" alt={APP_NAME} className="store-logo" />
        <p className="muted">Em qual loja você vai trabalhar agora?</p>
        <div className="store-btns">
          {STORES.map((s) => (
            <button key={s.id} className="store-btn" onClick={() => onChoose(s.id)}>
              <span className="store-emoji">{s.emoji}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
        {email && <button className="link-muted" onClick={onSignOut}>Sair ({email})</button>}
      </div>
    </div>
  );
}
