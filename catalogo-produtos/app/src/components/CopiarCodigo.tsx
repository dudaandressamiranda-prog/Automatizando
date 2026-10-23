import { type KeyboardEvent, type MouseEvent, useState } from 'react';

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // sem permissão de área de transferência (http, navegador antigo)
    const campo = document.createElement('textarea');
    campo.value = texto;
    campo.setAttribute('readonly', '');
    campo.style.position = 'fixed';
    campo.style.opacity = '0';
    document.body.appendChild(campo);
    campo.select();
    const ok = document.execCommand('copy');
    campo.remove();
    return ok;
  }
}

interface Props {
  codigo: string;
  /** Classes do texto (ex.: "tiny muted"). */
  className?: string;
}

/**
 * Código (EAN, SKU) com um botãozinho de copiar ao lado.
 *
 * Quase sempre o código está dentro de um card que é link para o produto:
 * o clique no botão não pode subir até ele, senão copiar abriria a ficha.
 * É um span com papel de botão, e não um <button>, porque em alguns cards
 * o próprio card já é um botão — e botão dentro de botão quebra o HTML.
 */
export function CopiarCodigo({ codigo, className }: Props) {
  const [copiado, setCopiado] = useState(false);

  async function acionar(e: MouseEvent | KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (await copiar(codigo)) {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    }
  }

  return (
    <span className={`cod ${className ?? ''}`}>
      <span className="mono">{codigo}</span>
      <span
        role="button"
        tabIndex={0}
        className={`cod-copiar ${copiado ? 'ok' : ''}`}
        title={copiado ? 'Copiado!' : 'Copiar'}
        aria-label={copiado ? 'Copiado' : `Copiar ${codigo}`}
        onClick={acionar}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') void acionar(e);
        }}
      >
        {copiado ? (
          '✓'
        ) : (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="5" y="5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 3.5V3a1.5 1.5 0 0 0-1.5-1.5H3A1.5 1.5 0 0 0 1.5 3v6.5A1.5 1.5 0 0 0 3 11h.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        )}
      </span>
    </span>
  );
}
