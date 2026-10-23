import { useCallback, useEffect, useRef, useState } from 'react';
import { mensagemErroCamera, vibrar } from '../lib/camera';
import { interpretarOcr, lerDataDigitada } from '../lib/loteParser';
import type { NovaValidade, ProdutoDoCodigo } from '../lib/validades';
import { CopiarCodigo } from './CopiarCodigo';

interface Props {
  codigo: string;
  produto: ProdutoDoCodigo | null;
  nomeInicial: string;
  /** Já vem preenchido quando o código lido na tela anterior era um GS1 (DataMatrix de medicamento) com lote/validade embutidos. */
  loteInicial: string;
  validadeInicial: string;
  /** Grava o registro. Devolve false se a pessoa desistiu (ex.: repetido). */
  onSalvar: (v: NovaValidade) => Promise<boolean>;
  onOutroProduto: () => void;
  onFechar: () => void;
}

/*
 * Tela 2 de 2: já com o produto identificado, mira no lote e na validade da
 * embalagem e lê por OCR. Abre uma câmera nova (não é a mesma da tela do
 * código) — isso também ajuda o celular a focar de novo, já que o foco da
 * primeira tela ficava "viciado" na distância do código de barras.
 *
 * Tem um botão para desistir da câmera e digitar tudo na mão, para quando o
 * OCR não cooperar (embalagem amassada, letra apagada, etc.).
 */

type Campo = 'lote' | 'validade';

// Quantas leituras iguais confirmam um campo — uma só erra demais.
const LEITURAS_PARA_CONFIRMAR = 2;

// ---------------------------------------------------------------------------
// OCR (Tesseract.js) — um worker só para o app inteiro, criado na primeira
// vez e reaproveitado: baixar o modelo (~7 MB, fica em cache) é o caro.
// ---------------------------------------------------------------------------

type WorkerOcr = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>;
let workerOcr: Promise<WorkerOcr> | null = null;

function prepararOcr(): Promise<WorkerOcr> {
  workerOcr ??= (async () => {
    const { createWorker } = await import('tesseract.js');
    const w = await createWorker('eng', 1);
    await w.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/.-: ',
      preserve_interword_spaces: '1',
    });
    return w;
  })().catch((e) => {
    workerOcr = null; // deixa tentar de novo na próxima vez
    throw e;
  });
  return workerOcr;
}

/** Recorta da imagem só a área da moldura e estica o contraste para o OCR. */
function recortarMira(video: HTMLVideoElement, mira: HTMLElement, canvas: HTMLCanvasElement, desfocar: boolean) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const rv = video.getBoundingClientRect();
  const rm = mira.getBoundingClientRect();
  // o vídeo usa object-fit: cover — converte coordenadas da tela para a imagem
  const escala = Math.max(rv.width / vw, rv.height / vh);
  const offX = (rv.width - vw * escala) / 2;
  const offY = (rv.height - vh * escala) / 2;
  const sx = Math.max(0, (rm.left - rv.left - offX) / escala);
  const sy = Math.max(0, (rm.top - rv.top - offY) / escala);
  const sw = Math.min(vw - sx, rm.width / escala);
  const sh = Math.min(vh - sy, rm.height / escala);
  if (sw < 10 || sh < 10) return null;

  // texto pequeno fica melhor ampliado; imagem grande demais fica lenta
  const k = Math.min(1600, Math.max(1000, sw)) / sw;
  canvas.width = Math.round(sw * k);
  canvas.height = Math.round(sh * k);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  // um leve desfoque "junta" os pontinhos da impressão a jato de tinta
  ctx.filter = desfocar ? 'blur(1px)' : 'none';
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  ctx.filter = 'none';

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  let min = 255;
  let max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i]! * 299 + d[i + 1]! * 587 + d[i + 2]! * 114) / 1000;
    d[i] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const faixa = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) {
    const g = ((d[i]! - min) * 255) / faixa;
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function LeitorLoteValidade({
  codigo, produto, nomeInicial, loteInicial, validadeInicial, onSalvar, onOutroProduto, onFechar,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const miraRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasOcr = useRef<HTMLCanvasElement>(document.createElement('canvas'));

  const [cameraPronta, setCameraPronta] = useState(false);
  const [erroCamera, setErroCamera] = useState<string | null>(null);
  const [lanterna, setLanterna] = useState({ suporta: false, ligada: false });
  const [manual, setManual] = useState(false);

  const [nome, setNome] = useState(nomeInicial);
  const [lote, setLote] = useState(loteInicial);
  const [validade, setValidade] = useState(validadeInicial);
  const confInicial = { lote: Boolean(loteInicial), validade: Boolean(validadeInicial) };
  const [confirmado, setConfirmado] = useState(confInicial);
  const [digitado, setDigitado] = useState({ lote: false, validade: false });
  const [lendo, setLendo] = useState(!(confInicial.lote && confInicial.validade));
  const [statusOcr, setStatusOcr] = useState<string | null>(null);
  const [textoLido, setTextoLido] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // o laço do OCR roda fora do ciclo do React — lê o estado atual por refs
  const votos = useRef<Record<Campo, Record<string, number>>>({ lote: {}, validade: {} });
  const confirmadoRef = useRef(confirmado);
  const digitadoRef = useRef(digitado);
  confirmadoRef.current = confirmado;
  digitadoRef.current = digitado;

  // ---- câmera: liga ao abrir (exceto em modo manual), desliga ao sair ----
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
    // já baixa o OCR enquanto a pessoa posiciona a embalagem
    prepararOcr().catch(() => {});
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

  // ---- OCR do lote e da validade ------------------------------------------
  useEffect(() => {
    if (manual || !cameraPronta || !lendo) return;
    let vivo = true;
    let quadro = 0;
    (async () => {
      let worker: WorkerOcr;
      try {
        setStatusOcr('Preparando o leitor de texto…');
        worker = await prepararOcr();
        setStatusOcr(null);
      } catch {
        setStatusOcr('Leitor de texto indisponível (sem internet?). Digite o lote e a validade.');
        setLendo(false);
        return;
      }
      while (vivo) {
        const video = videoRef.current;
        const mira = miraRef.current;
        if (video && mira && video.readyState >= 2) {
          const canvas = recortarMira(video, mira, canvasOcr.current, quadro % 2 === 1);
          if (canvas) {
            try {
              // alterna entre "bloco de texto" e "texto espalhado"
              await worker.setParameters({ tessedit_pageseg_mode: (quadro % 4 < 2 ? '6' : '11') as never });
              const { data } = await worker.recognize(canvas);
              if (vivo) processar(data.text ?? '');
            } catch {
              /* quadro ruim — tenta o próximo */
            }
            quadro++;
          }
        }
        await new Promise((r) => setTimeout(r, 150));
      }
    })();
    return () => {
      vivo = false;
    };

    function processar(texto: string) {
      if (texto.trim()) setTextoLido(texto.trim());
      const r = interpretarOcr(texto);
      const conf = { ...confirmadoRef.current };
      const votar = (campo: Campo, valor: string) => {
        const v = votos.current[campo];
        v[valor] = (v[valor] ?? 0) + 1;
        return Object.entries(v).sort((a, b) => b[1] - a[1])[0]!;
      };
      if (r.lote && !conf.lote && !digitadoRef.current.lote) {
        const [melhor, n] = votar('lote', r.lote);
        setLote(melhor);
        if (n >= LEITURAS_PARA_CONFIRMAR) conf.lote = true;
      }
      if (r.validade && !conf.validade && !digitadoRef.current.validade) {
        const [melhor, n] = votar('validade', r.validade.texto);
        setValidade(melhor);
        if (n >= LEITURAS_PARA_CONFIRMAR) conf.validade = true;
      }
      confirmadoRef.current = conf;
      setConfirmado(conf);
      if (conf.lote && conf.validade) {
        vivo = false;
        setLendo(false);
        vibrar([60, 60, 60]);
      }
    }
  }, [manual, cameraPronta, lendo]);

  function digitar(campo: Campo, valor: string) {
    // o que a pessoa digitou não é sobrescrito pela câmera
    if (campo === 'lote') setLote(valor);
    else setValidade(valor);
    const dig = { ...digitadoRef.current, [campo]: true };
    const conf = { ...confirmadoRef.current, [campo]: true };
    setDigitado(dig);
    setConfirmado(conf);
    if (conf.lote && conf.validade) setLendo(false);
  }

  function lerDeNovo() {
    votos.current = { lote: {}, validade: {} };
    setLote('');
    setValidade('');
    setDigitado({ lote: false, validade: false });
    setConfirmado({ lote: false, validade: false });
    setTextoLido('');
    setLendo(true);
  }

  function ativarManual() {
    setLendo(false);
    setManual(true);
  }

  function voltarCamera() {
    setManual(false);
    setLendo(!(confirmadoRef.current.lote && confirmadoRef.current.validade));
  }

  async function salvar(proximo: boolean) {
    setErro(null);
    const nomeFinal = nome.trim();
    const loteFinal = lote.trim().toUpperCase();
    if (!nomeFinal) return setErro('Produto fora do catálogo: escreva o nome dele.');
    if (!loteFinal && !validade.trim()) return setErro('Informe pelo menos o lote ou a validade.');
    const data = validade.trim() ? lerDataDigitada(validade) : null;
    if (validade.trim() && !data) return setErro('Validade não reconhecida. Use dd/mm/aaaa ou mm/aaaa.');

    setSalvando(true);
    try {
      const salvou = await onSalvar({
        product_id: produto?.id ?? null,
        product_name: nomeFinal,
        barcode: codigo || null,
        lote: loteFinal || null,
        validade: data?.iso ?? null,
        validade_so_mes: data?.soMes ?? false,
      });
      if (!salvou) return;
      if (proximo) onOutroProduto();
      else onFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  const estado = (campo: Campo, valor: string) => {
    if (digitado[campo]) return 'digitado';
    if (confirmado[campo] && valor) return '✓ lido';
    if (valor) return 'confirmando…';
    return lendo ? 'lendo…' : '';
  };

  const completo = confirmado.lote && confirmado.validade && Boolean(lote || validade);

  return (
    <div className="lv-overlay lv-lote">
      {!manual && (
        <div className="lv-camera">
          <video ref={videoRef} className="lv-video" playsInline muted autoPlay />
          <div ref={miraRef} className={`lv-mira lv-mira-texto ${lendo ? 'lendo' : ''} ${completo ? 'completo' : ''}`} />
          <p className="lv-dica">
            {completo ? <>Lido! Confira e toque em <strong>Salvar</strong></> : <>Mire no <strong>lote</strong> e na <strong>validade</strong></>}
          </p>
          <div className="lv-acoes">
            {lanterna.suporta && (
              <button className={`lv-redondo ${lanterna.ligada ? 'on' : ''}`} onClick={alternarLanterna} aria-label="Lanterna">🔦</button>
            )}
            <button className="lv-redondo" onClick={lerDeNovo} aria-label="Ler de novo" title="Ler de novo">⟳</button>
          </div>
          {erroCamera && <p className="lv-erro-camera">{erroCamera} Você pode digitar o lote e a validade abaixo.</p>}
        </div>
      )}

      <form className="lv-painel" onSubmit={(e) => { e.preventDefault(); void salvar(false); }}>
        <div className="lv-produto">
          {codigo && <CopiarCodigo codigo={codigo} className="tiny muted" />}
          {produto ? (
            <strong>{produto.name}</strong>
          ) : (
            <input
              type="text"
              placeholder="Produto fora do catálogo — nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          )}
        </div>

        <div className="lv-campos">
          <label>
            <span>Lote <em className={confirmado.lote && lote ? 'ok' : ''}>{estado('lote', lote)}</em></span>
            <input
              type="text"
              autoCapitalize="characters"
              spellCheck={false}
              value={lote}
              onChange={(e) => digitar('lote', e.target.value)}
              className={confirmado.lote && lote ? 'ok' : ''}
              autoFocus={manual}
            />
          </label>
          <label>
            <span>Validade <em className={confirmado.validade && validade ? 'ok' : ''}>{estado('validade', validade)}</em></span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="dd/mm/aaaa ou mm/aaaa"
              spellCheck={false}
              value={validade}
              onChange={(e) => digitar('validade', e.target.value)}
              className={confirmado.validade && validade ? 'ok' : ''}
            />
          </label>
        </div>

        {!manual && statusOcr && <p className="tiny muted">{statusOcr}</p>}
        {!manual && textoLido && (
          <details className="lv-texto">
            <summary>Ver texto lido pela câmera</summary>
            <pre>{textoLido}</pre>
          </details>
        )}
        {erro && <p className="error">{erro}</p>}

        <button type="button" className="link-muted lv-largo" onClick={manual ? voltarCamera : ativarManual}>
          {manual ? '📷 Tentar de novo com a câmera' : '⌨️ Prefiro digitar, sem câmera'}
        </button>

        <div className="lv-botoes">
          <button type="button" className="secondary" onClick={onOutroProduto}>Outro produto</button>
          <button type="submit" className="secondary" disabled={salvando}>Salvar</button>
        </div>
        <button type="button" className="primary lv-largo" disabled={salvando} onClick={() => void salvar(true)}>
          {salvando ? 'Salvando…' : 'Salvar e bipar o próximo'}
        </button>
        <button type="button" className="link-muted lv-largo" onClick={onFechar}>Fechar</button>
      </form>
    </div>
  );
}
