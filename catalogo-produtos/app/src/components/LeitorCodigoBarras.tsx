import { BrowserMultiFormatReader } from '@zxing/browser';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { mensagemErroCamera, vibrar } from '../lib/camera';

interface Props {
  /** Texto cru lido (câmera ou digitado) — quem chama decide o que fazer com ele. */
  onLido: (bruto: string) => void;
  onFechar: () => void;
}

/*
 * Tela 1 de 2 da conferência de lote/validade: só lê o código de barras.
 * Fica só nisso — nada de já tentar achar lote e validade junto, que é o
 * que deixava a câmera lenta e confusa. Achado o código, esta tela fecha e
 * quem chamou abre a segunda, já com uma câmera nova.
 */

type Leitor = (video: HTMLVideoElement) => Promise<string | null>;
let leitorCodigo: Promise<Leitor> | null = null;

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
interface BarcodeDetectorCtor {
  new (opts: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
}

// BarcodeDetector nativo (Android/Chrome) ou ZXing (iPhone), preparado uma
// vez só e reaproveitado entre uma tela e outra.
function prepararLeitorCodigo(): Promise<Leitor> {
  leitorCodigo ??= (async () => {
    const Nativo = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (Nativo) {
      try {
        const desejados = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'data_matrix', 'qr_code'];
        const suportados = await Nativo.getSupportedFormats();
        const formatos = desejados.filter((f) => suportados.includes(f));
        if (formatos.length) {
          const detector = new Nativo({ formats: formatos });
          return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
        }
      } catch {
        /* cai para o ZXing */
      }
    }
    const reader = new BrowserMultiFormatReader();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    return async (video) => {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return null;
      // só o miolo da imagem, onde fica a mira — bem mais rápido
      const w = Math.round(vw * 0.9);
      const h = Math.round(vh * 0.6);
      const k = Math.min(1, 1280 / w);
      canvas.width = Math.round(w * k);
      canvas.height = Math.round(h * k);
      ctx.drawImage(video, (vw - w) / 2, (vh - h) / 2, w, h, 0, 0, canvas.width, canvas.height);
      try {
        return reader.decodeFromCanvas(canvas).getText();
      } catch {
        return null; // nenhum código nesta imagem
      }
    };
  })();
  return leitorCodigo;
}

export function LeitorCodigoBarras({ onLido, onFechar }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraPronta, setCameraPronta] = useState(false);
  const [erroCamera, setErroCamera] = useState<string | null>(null);
  const [lanterna, setLanterna] = useState({ suporta: false, ligada: false });
  const [manual, setManual] = useState(false);
  const [digitado, setDigitado] = useState('');

  const ligarCamera = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Este navegador não permite usar a câmera (precisa de https).');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0]!;
      try {
        await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] });
      } catch {
        /* nem todo aparelho aceita */
      }
      const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
      setLanterna({ suporta: Boolean(caps.torch), ligada: false });
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => {});
      setErroCamera(null);
      setCameraPronta(true);
    } catch (e) {
      setErroCamera(mensagemErroCamera(e));
    }
  }, []);

  const desligarCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraPronta(false);
  }, []);

  useEffect(() => {
    if (manual) {
      desligarCamera();
      return;
    }
    void ligarCamera();
    void prepararLeitorCodigo();
    const aoMudarVisibilidade = () => {
      if (document.hidden) desligarCamera();
      else void ligarCamera();
    };
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    return () => {
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      desligarCamera();
    };
  }, [manual, ligarCamera, desligarCamera]);

  async function alternarLanterna() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !lanterna.ligada } as MediaTrackConstraintSet] });
      setLanterna((l) => ({ ...l, ligada: !l.ligada }));
    } catch {
      setLanterna((l) => ({ ...l, suporta: false }));
    }
  }

  useEffect(() => {
    if (manual || !cameraPronta) return;
    let vivo = true;
    (async () => {
      const ler = await prepararLeitorCodigo();
      while (vivo) {
        const video = videoRef.current;
        let lido: string | null = null;
        if (video && video.readyState >= 2) {
          try {
            lido = await ler(video);
          } catch {
            lido = null;
          }
        }
        if (lido && vivo) {
          vibrar(80);
          onLido(lido);
          return;
        }
        await new Promise((r) => setTimeout(r, 120));
      }
    })();
    return () => {
      vivo = false;
    };
  }, [manual, cameraPronta, onLido]);

  function enviarDigitado(e: FormEvent) {
    e.preventDefault();
    const v = digitado.trim();
    if (v) onLido(v);
    setDigitado('');
  }

  if (manual) {
    return (
      <div className="lv-overlay lv-codigo">
        <div className="lv-painel">
          <p className="muted">Digite o código de barras do produto.</p>
          <form className="lv-linha" onSubmit={enviarDigitado}>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Código de barras"
              value={digitado}
              onChange={(e) => setDigitado(e.target.value)}
              autoFocus
            />
            <button type="submit" className="secondary">OK</button>
          </form>
          <button type="button" className="link-muted lv-largo" onClick={() => setManual(false)}>
            📷 Tentar com a câmera
          </button>
          <button type="button" className="secondary lv-largo" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="lv-overlay lv-codigo">
      <div className="lv-camera">
        <video ref={videoRef} className="lv-video" playsInline muted autoPlay />
        <div className="lv-mira lv-mira-codigo"><span className="lv-laser" /></div>
        <p className="lv-dica">Aponte para o <strong>código de barras</strong></p>
        <div className="lv-acoes">
          {lanterna.suporta && (
            <button className={`lv-redondo ${lanterna.ligada ? 'on' : ''}`} onClick={alternarLanterna} aria-label="Lanterna">
              🔦
            </button>
          )}
        </div>
        {erroCamera && <p className="lv-erro-camera">{erroCamera} Você pode digitar o código abaixo.</p>}
      </div>

      <div className="lv-painel">
        <form className="lv-linha" onSubmit={enviarDigitado}>
          <input
            type="text"
            inputMode="numeric"
            placeholder="ou digite o código"
            value={digitado}
            onChange={(e) => setDigitado(e.target.value)}
          />
          <button type="submit" className="secondary">OK</button>
        </form>
        <button type="button" className="link-muted lv-largo" onClick={() => setManual(true)}>
          ⌨️ Só digitar, sem câmera
        </button>
        <button type="button" className="secondary lv-largo" onClick={onFechar}>Fechar</button>
      </div>
    </div>
  );
}
