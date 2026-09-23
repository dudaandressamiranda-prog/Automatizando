import { BrowserMultiFormatReader } from '@zxing/browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { gtinParaEan, interpretarOcr, lerDataDigitada, lerGs1 } from '../lib/loteParser';
import { cleanBarcode } from '../lib/normalize';
import { buscarPorCodigo, type NovaValidade, type ProdutoDoCodigo } from '../lib/validades';

interface Props {
  onFechar: () => void;
  /** Grava o registro. Devolve false se a pessoa desistiu (ex.: repetido). */
  onSalvar: (v: NovaValidade) => Promise<boolean>;
}

/*
 * Fluxo de conferência em duas etapas com a MESMA câmera, sem desligar no
 * meio: primeiro lê o código de barras; achado o produto, a imagem encolhe
 * para a metade de cima e o OCR passa a ler o lote e a validade dentro da
 * moldura. O que é lido vira texto nos campos — nenhuma foto é guardada.
 */

type Fase = 'codigo' | 'buscando' | 'lote';
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

// ---------------------------------------------------------------------------
// Código de barras: BarcodeDetector nativo (Android/Chrome) ou ZXing (iPhone)
// ---------------------------------------------------------------------------

type Leitor = (video: HTMLVideoElement) => Promise<string | null>;
let leitorCodigo: Promise<Leitor> | null = null;

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
interface BarcodeDetectorCtor {
  new (opts: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
}

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

// ---------------------------------------------------------------------------

function mensagemErroCamera(e: unknown): string {
  const nome = e instanceof DOMException ? e.name : '';
  if (nome === 'NotAllowedError' || nome === 'SecurityError') return 'Permita o acesso à câmera para continuar.';
  if (nome === 'NotFoundError' || nome === 'OverconstrainedError') return 'Nenhuma câmera encontrada neste aparelho.';
  if (nome === 'NotReadableError') return 'A câmera está sendo usada por outro app. Feche-o e tente de novo.';
  return e instanceof Error ? e.message : 'Não foi possível abrir a câmera.';
}

const vibrar = (p: number | number[]) => navigator.vibrate?.(p);

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

export function LeitorValidade({ onFechar, onSalvar }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const miraRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasOcr = useRef<HTMLCanvasElement>(document.createElement('canvas'));

  const [fase, setFase] = useState<Fase>('codigo');
  const [cameraPronta, setCameraPronta] = useState(false);
  const [erroCamera, setErroCamera] = useState<string | null>(null);
  const [lanterna, setLanterna] = useState({ suporta: false, ligada: false });
  const [digitadoCodigo, setDigitadoCodigo] = useState('');

  const [codigo, setCodigo] = useState('');
  const [produto, setProduto] = useState<ProdutoDoCodigo | null>(null);
  const [nome, setNome] = useState('');
  const [lote, setLote] = useState('');
  const [validade, setValidade] = useState('');
  const [confirmado, setConfirmado] = useState({ lote: false, validade: false });
  const [digitado, setDigitado] = useState({ lote: false, validade: false });
  const [lendo, setLendo] = useState(false);
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

  // ---- câmera: liga ao abrir, desliga ao fechar ou ao sair do app --------
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
    void ligarCamera();
    void prepararLeitorCodigo();
    // já baixa o OCR enquanto a pessoa procura o código de barras
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
  }, [ligarCamera, desligarCamera]);

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

  // ---- etapa 1: código de barras -----------------------------------------
  const codigoLido = useCallback(async (bruto: string) => {
    const gs1 = lerGs1(bruto);
    const cod = gs1 ? gtinParaEan(gs1.gtin) : cleanBarcode(bruto) ?? bruto.trim();
    if (!cod) return;
    vibrar(80);
    setFase('buscando');
    setErro(null);
    let achado: ProdutoDoCodigo | null = null;
    try {
      achado = await buscarPorCodigo(cod);
    } catch {
      /* sem conexão: segue, a pessoa digita o nome */
    }
    setCodigo(cod);
    setProduto(achado);
    setNome(achado?.name ?? '');
    setTextoLido('');
    votos.current = { lote: {}, validade: {} };
    setDigitado({ lote: false, validade: false });
    // DataMatrix de medicamento já traz lote e validade — nem precisa de OCR
    const loteGs1 = gs1?.lote ?? '';
    const valGs1 = gs1?.validade?.texto ?? '';
    setLote(loteGs1);
    setValidade(valGs1);
    const conf = { lote: Boolean(loteGs1), validade: Boolean(valGs1) };
    setConfirmado(conf);
    setLendo(!(conf.lote && conf.validade));
    setFase('lote');
  }, []);

  useEffect(() => {
    if (fase !== 'codigo' || !cameraPronta) return;
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
          void codigoLido(lido);
          return;
        }
        await new Promise((r) => setTimeout(r, 120));
      }
    })();
    return () => {
      vivo = false;
    };
  }, [fase, cameraPronta, codigoLido]);

  // ---- etapa 2: OCR do lote e da validade --------------------------------
  useEffect(() => {
    if (fase !== 'lote' || !cameraPronta || !lendo) return;
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
  }, [fase, cameraPronta, lendo]);

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

  function voltarParaCodigo() {
    setLendo(false);
    setErro(null);
    setFase('codigo');
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
      if (proximo) voltarParaCodigo();
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

  const completo = fase === 'lote' && confirmado.lote && confirmado.validade && Boolean(lote || validade);

  return (
    <div className={`lv-overlay lv-${fase === 'lote' ? 'lote' : 'codigo'}`}>
      <div className="lv-camera">
        <video ref={videoRef} className="lv-video" playsInline muted autoPlay />
        {fase === 'lote' ? (
          <div ref={miraRef} className={`lv-mira lv-mira-texto ${lendo ? 'lendo' : ''} ${completo ? 'completo' : ''}`} />
        ) : (
          <div className="lv-mira lv-mira-codigo"><span className="lv-laser" /></div>
        )}
        <p className="lv-dica">
          {fase === 'codigo' && <>Aponte para o <strong>código de barras</strong></>}
          {fase === 'buscando' && 'Procurando o produto…'}
          {fase === 'lote' && (completo
            ? <>Lido! Confira e toque em <strong>Salvar</strong></>
            : <>Mire no <strong>lote</strong> e na <strong>validade</strong></>)}
        </p>
        <div className="lv-acoes">
          {lanterna.suporta && (
            <button className={`lv-redondo ${lanterna.ligada ? 'on' : ''}`} onClick={alternarLanterna} aria-label="Lanterna">🔦</button>
          )}
          {fase === 'lote' && (
            <button className="lv-redondo" onClick={lerDeNovo} aria-label="Ler de novo" title="Ler de novo">⟳</button>
          )}
        </div>
        {erroCamera && (
          <p className="lv-erro-camera">
            {erroCamera}
            {fase === 'lote' ? ' Você pode digitar o lote e a validade abaixo.' : ' Você pode digitar o código abaixo.'}
          </p>
        )}
      </div>

      {fase !== 'lote' ? (
        <div className="lv-painel">
          <form
            className="lv-linha"
            onSubmit={(e) => {
              e.preventDefault();
              if (digitadoCodigo.trim()) void codigoLido(digitadoCodigo);
              setDigitadoCodigo('');
            }}
          >
            <input
              type="text"
              inputMode="numeric"
              placeholder="ou digite o código"
              value={digitadoCodigo}
              onChange={(e) => setDigitadoCodigo(e.target.value)}
            />
            <button type="submit" className="secondary">OK</button>
          </form>
          <button className="secondary lv-largo" onClick={onFechar}>Fechar</button>
        </div>
      ) : (
        <form className="lv-painel" onSubmit={(e) => { e.preventDefault(); void salvar(false); }}>
          <div className="lv-produto">
            <span className="mono tiny muted">{codigo}</span>
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

          {statusOcr && <p className="tiny muted">{statusOcr}</p>}
          {textoLido && (
            <details className="lv-texto">
              <summary>Ver texto lido pela câmera</summary>
              <pre>{textoLido}</pre>
            </details>
          )}
          {erro && <p className="error">{erro}</p>}

          <div className="lv-botoes">
            <button type="button" className="secondary" onClick={voltarParaCodigo}>Outro produto</button>
            <button type="submit" className="secondary" disabled={salvando}>Salvar</button>
          </div>
          <button type="button" className="primary lv-largo" disabled={salvando} onClick={() => void salvar(true)}>
            {salvando ? 'Salvando…' : 'Salvar e bipar o próximo'}
          </button>
          <button type="button" className="link-muted lv-largo" onClick={onFechar}>Fechar</button>
        </form>
      )}
    </div>
  );
}
