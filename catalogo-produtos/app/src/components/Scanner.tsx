import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { useEffect, useRef, useState } from 'react';

interface Props {
  onResult: (code: string) => void;
  onClose: () => void;
}

/**
 * Leitor de código de barras pela câmera (biblioteca ZXing — funciona
 * também no Safari/iPhone, que não tem o BarcodeDetector nativo).
 * Precisa de HTTPS (ou localhost) para a câmera abrir.
 */
export function Scanner({ onResult, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let controls: IScannerControls | undefined;
    let done = false;
    const reader = new BrowserMultiFormatReader();

    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (result, _err, c) => {
        controls = c;
        if (result && !done) {
          done = true;
          c.stop();
          onResult(result.getText());
        }
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        setError(
          msg.includes('Permission') || msg.includes('NotAllowed')
            ? 'Permita o acesso à câmera para ler o código.'
            : `Não foi possível abrir a câmera: ${msg}`,
        );
      });

    return () => controls?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="scanner-overlay" onClick={onClose}>
      <div className="scanner-box" onClick={(e) => e.stopPropagation()}>
        {error ? <p className="error">{error}</p> : <video ref={videoRef} className="scanner-video" />}
        <button className="secondary" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  );
}
