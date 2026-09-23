/*
 * Lotes e Validades — bipa o código de barras e lê o lote e a validade
 * impressos na embalagem pela câmera do celular, salvando tudo como TEXTO
 * (nenhuma foto é guardada).
 *
 * Bibliotecas (carregadas do CDN só quando precisa):
 *  - Tesseract.js: leitura de texto (OCR), roda no próprio celular.
 *  - ZXing: leitor de código de barras para celulares sem o
 *    BarcodeDetector nativo (ex.: iPhone).
 */
(function () {
  "use strict";

  const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  const ZXING_URL = "https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js";
  const CHAVE_REGISTROS = "lv_registros";
  const CHAVE_PRODUTOS = "lv_produtos";
  const DIAS_ALERTA = 30;
  // Quantas leituras iguais confirmam um campo.
  const LEITURAS_PARA_CONFIRMAR = 2;

  const P = window.LoteParser;
  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------------
  // Armazenamento (somente no aparelho)
  // ------------------------------------------------------------------

  function lerJson(chave, padrao) {
    try {
      const v = localStorage.getItem(chave);
      return v ? JSON.parse(v) : padrao;
    } catch {
      return padrao;
    }
  }

  function gravarJson(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
    } catch {
      avisar("Não foi possível salvar no aparelho (armazenamento cheio ou bloqueado).");
    }
  }

  let registros = lerJson(CHAVE_REGISTROS, []);
  let produtos = lerJson(CHAVE_PRODUTOS, {});

  // ------------------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------------------

  function carregarScript(url) {
    return new Promise((ok, falha) => {
      const s = document.createElement("script");
      s.src = url;
      s.onload = ok;
      s.onerror = () => falha(new Error("Falha ao baixar " + url));
      document.head.appendChild(s);
    });
  }

  let toastTimer;
  function avisar(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add("hidden"), 2600);
  }

  function vibrar(ms) {
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  function hojeIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function diasAte(iso) {
    const [a, m, d] = iso.split("-").map(Number);
    const [ha, hm, hd] = hojeIso().split("-").map(Number);
    return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(ha, hm - 1, hd)) / 86400000);
  }

  function escapar(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function limparCodigo(c) {
    return String(c || "").trim().replace(/\s+/g, "");
  }

  // ------------------------------------------------------------------
  // Telas
  // ------------------------------------------------------------------

  const TELAS = ["telaLista", "telaBarcode", "telaLote"];
  let telaAtual = "telaLista";

  function mostrarTela(id) {
    // Uma entrada no histórico enquanto a câmera está aberta, para o botão
    // "voltar" do Android fechar a câmera em vez de sair do app.
    if (id !== "telaLista" && telaAtual === "telaLista") history.pushState({ camera: true }, "");
    if (id === "telaLista" && telaAtual !== "telaLista" && history.state && history.state.camera) history.back();
    telaAtual = id;
    TELAS.forEach((t) => $(t).classList.toggle("hidden", t !== id));
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------------
  // Câmera (um único stream, reaproveitado entre as telas)
  // ------------------------------------------------------------------

  let stream = null;
  let lanternaLigada = false;

  async function ligarCamera() {
    if (stream && stream.getVideoTracks().some((t) => t.readyState === "live")) return stream;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Este navegador não permite usar a câmera. Abra o app pelo endereço https:// no Chrome ou Safari.");
    }
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });
    lanternaLigada = false;
    const track = stream.getVideoTracks()[0];
    try {
      await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
    } catch {
      /* nem todo aparelho aceita — tudo bem */
    }
    return stream;
  }

  function desligarCamera() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    lanternaLigada = false;
    ["videoBarcode", "videoLote"].forEach((id) => ($(id).srcObject = null));
  }

  async function mostrarCameraEm(video) {
    const s = await ligarCamera();
    if (video.srcObject !== s) video.srcObject = s;
    try {
      await video.play();
    } catch {
      /* autoplay mudo normalmente funciona; ignora */
    }
    atualizarBotoesLanterna();
  }

  function suportaLanterna() {
    const track = stream && stream.getVideoTracks()[0];
    try {
      return !!(track && track.getCapabilities && track.getCapabilities().torch);
    } catch {
      return false;
    }
  }

  function atualizarBotoesLanterna() {
    const suporta = suportaLanterna();
    ["btnLanternaBarcode", "btnLanternaLote"].forEach((id) => {
      $(id).classList.toggle("hidden", !suporta);
      $(id).classList.toggle("ativo", lanternaLigada);
    });
  }

  async function alternarLanterna() {
    const track = stream && stream.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !lanternaLigada }] });
      lanternaLigada = !lanternaLigada;
    } catch {
      avisar("Não foi possível ligar a lanterna.");
    }
    atualizarBotoesLanterna();
  }

  function mensagemErroCamera(e) {
    const nome = (e && e.name) || "";
    if (nome === "NotAllowedError" || nome === "SecurityError") {
      return "Permita o acesso à câmera nas configurações do navegador para continuar.";
    }
    if (nome === "NotFoundError" || nome === "OverconstrainedError") return "Nenhuma câmera encontrada neste aparelho.";
    if (nome === "NotReadableError") return "A câmera está sendo usada por outro app. Feche-o e tente de novo.";
    return (e && e.message) || "Não foi possível abrir a câmera.";
  }

  // ------------------------------------------------------------------
  // Leitura do código de barras
  // ------------------------------------------------------------------

  let leitorBarcode = null; // função (video) => Promise<string|null>
  let barcodeAtivo = false;

  async function prepararLeitorBarcode() {
    if (leitorBarcode) return leitorBarcode;

    if ("BarcodeDetector" in window) {
      try {
        const desejados = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "data_matrix", "qr_code"];
        const suportados = await window.BarcodeDetector.getSupportedFormats();
        const formatos = desejados.filter((f) => suportados.includes(f));
        if (formatos.length) {
          const detector = new window.BarcodeDetector({ formats: formatos });
          leitorBarcode = async (video) => {
            const achados = await detector.detect(video);
            return achados.length ? achados[0].rawValue : null;
          };
          return leitorBarcode;
        }
      } catch {
        /* cai para o ZXing */
      }
    }

    await carregarScript(ZXING_URL);
    const reader = new window.ZXingBrowser.BrowserMultiFormatReader();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    leitorBarcode = async (video) => {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return null;
      // Só o miolo da imagem (onde está a mira) — mais rápido.
      const w = Math.round(vw * 0.9);
      const h = Math.round(vh * 0.6);
      const escala = Math.min(1, 1280 / w);
      canvas.width = Math.round(w * escala);
      canvas.height = Math.round(h * escala);
      ctx.drawImage(video, (vw - w) / 2, (vh - h) / 2, w, h, 0, 0, canvas.width, canvas.height);
      try {
        return reader.decodeFromCanvas(canvas).getText();
      } catch {
        return null; // nenhum código nesta imagem
      }
    };
    return leitorBarcode;
  }

  async function abrirLeitorBarcode() {
    $("erroBarcode").classList.add("hidden");
    mostrarTela("telaBarcode");
    try {
      await mostrarCameraEm($("videoBarcode"));
      await prepararLeitorBarcode();
    } catch (e) {
      $("erroBarcode").textContent = mensagemErroCamera(e);
      $("erroBarcode").classList.remove("hidden");
      return;
    }
    barcodeAtivo = true;
    cicloBarcode();
  }

  async function cicloBarcode() {
    if (!barcodeAtivo || telaAtual !== "telaBarcode") return;
    const video = $("videoBarcode");
    let codigo = null;
    if (video.readyState >= 2) {
      try {
        codigo = await leitorBarcode(video);
      } catch {
        codigo = null;
      }
    }
    if (codigo && barcodeAtivo) {
      barcodeAtivo = false;
      vibrar(80);
      codigoLido(codigo);
      return;
    }
    setTimeout(cicloBarcode, 120);
  }

  function fecharLeitorBarcode() {
    barcodeAtivo = false;
    desligarCamera();
    mostrarTela("telaLista");
  }

  // ------------------------------------------------------------------
  // Leitura de texto (OCR) — lote e validade
  // ------------------------------------------------------------------

  let ocrWorker = null;
  let ocrCarregando = null;
  let ocrAtivo = false;
  let ocrQuadro = 0;
  let votos = { lote: {}, validade: {} };
  let confirmado = { lote: false, validade: false };
  let editadoPeloUsuario = { lote: false, validade: false };
  const canvasOcr = document.createElement("canvas");
  const ctxOcr = canvasOcr.getContext("2d", { willReadFrequently: true });

  function prepararOcr() {
    if (ocrCarregando) return ocrCarregando;
    const status = $("statusOcr");
    ocrCarregando = (async () => {
      await carregarScript(TESSERACT_URL);
      const worker = await window.Tesseract.createWorker("eng", 1, {
        logger: (m) => {
          if (m.status && m.progress != null && m.progress < 1 && !ocrWorker) {
            status.textContent = `Preparando leitor de texto… ${Math.round(m.progress * 100)}%`;
          }
        },
      });
      await worker.setParameters({
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/.-: ",
        preserve_interword_spaces: "1",
      });
      ocrWorker = worker;
      status.textContent = "Leitor de texto pronto ✓";
      status.classList.add("ok");
      return worker;
    })().catch((e) => {
      ocrCarregando = null;
      status.textContent = "Leitor de texto indisponível (sem internet?). Dá para digitar o lote e a validade.";
      throw e;
    });
    return ocrCarregando;
  }

  /** Recorta da imagem da câmera só a área da mira e melhora o contraste. */
  function recortarMira(video) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;
    const rv = video.getBoundingClientRect();
    const rm = $("miraTexto").getBoundingClientRect();
    // O vídeo usa object-fit: cover — converte coordenadas da tela para a imagem.
    const escala = Math.max(rv.width / vw, rv.height / vh);
    const offX = (rv.width - vw * escala) / 2;
    const offY = (rv.height - vh * escala) / 2;
    let sx = (rm.left - rv.left - offX) / escala;
    let sy = (rm.top - rv.top - offY) / escala;
    let sw = rm.width / escala;
    let sh = rm.height / escala;
    sx = Math.max(0, sx);
    sy = Math.max(0, sy);
    sw = Math.min(vw - sx, sw);
    sh = Math.min(vh - sy, sh);
    if (sw < 10 || sh < 10) return null;

    // Texto pequeno fica melhor ampliado; imagem grande demais fica lenta.
    const alvo = Math.min(1600, Math.max(1000, sw));
    const k = alvo / sw;
    canvasOcr.width = Math.round(sw * k);
    canvasOcr.height = Math.round(sh * k);
    // Em quadros alternados, um leve desfoque "junta" os pontinhos da
    // impressão matricial (jato de tinta) usada em lote/validade.
    const desfocar = ocrQuadro % 2 === 1 && "filter" in ctxOcr;
    ctxOcr.filter = desfocar ? "blur(1px)" : "none";
    ctxOcr.drawImage(video, sx, sy, sw, sh, 0, 0, canvasOcr.width, canvasOcr.height);
    ctxOcr.filter = "none";

    // Tons de cinza + esticar o contraste.
    const img = ctxOcr.getImageData(0, 0, canvasOcr.width, canvasOcr.height);
    const d = img.data;
    let min = 255;
    let max = 0;
    for (let i = 0; i < d.length; i += 4) {
      const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
      d[i] = g;
      if (g < min) min = g;
      if (g > max) max = g;
    }
    const faixa = Math.max(1, max - min);
    for (let i = 0; i < d.length; i += 4) {
      const g = ((d[i] - min) * 255) / faixa;
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    ctxOcr.putImageData(img, 0, 0);
    return canvasOcr;
  }

  function reiniciarLeituraOcr() {
    votos = { lote: {}, validade: {} };
    confirmado = { lote: !!editadoPeloUsuario.lote, validade: !!editadoPeloUsuario.validade };
    $("miraTexto").classList.remove("completo");
    atualizarEstadoCampos();
  }

  async function iniciarOcr() {
    if (ocrAtivo) return;
    ocrAtivo = true;
    $("miraTexto").classList.add("lendo");
    try {
      await prepararOcr();
    } catch {
      ocrAtivo = false;
      $("miraTexto").classList.remove("lendo");
      atualizarEstadoCampos("indisponível");
      return;
    }
    cicloOcr();
  }

  function pararOcr() {
    ocrAtivo = false;
    $("miraTexto").classList.remove("lendo");
  }

  async function cicloOcr() {
    if (!ocrAtivo || telaAtual !== "telaLote") return;
    const video = $("videoLote");
    if (video.readyState >= 2 && ocrWorker) {
      const canvas = recortarMira(video);
      if (canvas) {
        try {
          // Alterna entre "bloco de texto" e "texto espalhado".
          await ocrWorker.setParameters({ tessedit_pageseg_mode: ocrQuadro % 4 < 2 ? "6" : "11" });
          const { data } = await ocrWorker.recognize(canvas);
          if (ocrAtivo) processarTextoLido(data.text || "");
        } catch {
          /* quadro ruim — tenta o próximo */
        }
        ocrQuadro++;
      }
    }
    if (ocrAtivo) setTimeout(cicloOcr, 150);
  }

  function votar(campo, valor) {
    const v = votos[campo];
    v[valor] = (v[valor] || 0) + 1;
    return Object.entries(v).sort((a, b) => b[1] - a[1])[0];
  }

  function processarTextoLido(texto) {
    const limpo = texto.trim();
    if (limpo) $("textoLido").textContent = limpo;
    const r = P.interpretar(texto);

    if (r.lote && !confirmado.lote) {
      const [melhor, n] = votar("lote", r.lote);
      $("loteLote").value = melhor;
      if (n >= LEITURAS_PARA_CONFIRMAR) confirmado.lote = true;
    }
    if (r.validade && !confirmado.validade) {
      const [melhor, n] = votar("validade", r.validade.texto);
      $("loteValidade").value = melhor;
      if (n >= LEITURAS_PARA_CONFIRMAR) confirmado.validade = true;
    }
    atualizarEstadoCampos();

    if (confirmado.lote && confirmado.validade) {
      pararOcr();
      vibrar([60, 60, 60]);
      $("miraTexto").classList.add("completo");
      $("dicaLote").innerHTML = "Lido! Confira os dados e toque em <strong>Salvar</strong>";
    }
  }

  function atualizarEstadoCampos(forcar) {
    [
      ["lote", "loteLote", "estadoLote"],
      ["validade", "loteValidade", "estadoValidade"],
    ].forEach(([campo, idInput, idEstado]) => {
      const el = $(idEstado);
      const preenchido = !!$(idInput).value.trim();
      $(idInput).classList.toggle("preenchido", preenchido && confirmado[campo]);
      el.classList.toggle("ok", confirmado[campo] && preenchido);
      if (forcar) el.textContent = forcar;
      else if (editadoPeloUsuario[campo]) el.textContent = "digitado";
      else if (confirmado[campo]) el.textContent = "✓ lido";
      else if (preenchido) el.textContent = "confirmando…";
      else el.textContent = ocrAtivo ? "lendo…" : "";
    });
  }

  // ------------------------------------------------------------------
  // Fluxo: código lido → tela do lote com a câmera já ligada
  // ------------------------------------------------------------------

  let eanAtual = "";

  function codigoLido(codigoBruto) {
    const gs1 = P.lerGs1(codigoBruto);
    const ean = gs1 ? P.gtinParaEan(gs1.gtin) : limparCodigo(codigoBruto);
    if (!ean) return;
    abrirTelaLote(ean, gs1);
  }

  async function abrirTelaLote(ean, gs1) {
    eanAtual = ean;
    $("loteEan").textContent = ean;
    $("loteProduto").value = produtos[ean] || "";
    $("loteLote").value = "";
    $("loteValidade").value = "";
    $("textoLido").textContent = "—";
    $("erroForm").classList.add("hidden");
    $("erroLote").classList.add("hidden");
    $("dicaLote").innerHTML = "Mire no <strong>lote</strong> e na <strong>validade</strong>";
    editadoPeloUsuario = { lote: false, validade: false };
    reiniciarLeituraOcr();
    mostrarTela("telaLote");

    // Código GS1 (DataMatrix) já traz lote e validade — nem precisa de OCR.
    if (gs1 && (gs1.lote || gs1.validade)) {
      if (gs1.lote) $("loteLote").value = gs1.lote;
      if (gs1.validade) $("loteValidade").value = gs1.validade.texto;
      confirmado = { lote: !!gs1.lote, validade: !!gs1.validade };
      atualizarEstadoCampos();
    }

    try {
      await mostrarCameraEm($("videoLote"));
    } catch (e) {
      $("erroLote").textContent = mensagemErroCamera(e) + " Você pode digitar o lote e a validade abaixo.";
      $("erroLote").classList.remove("hidden");
      atualizarEstadoCampos("");
      return;
    }
    if (!(confirmado.lote && confirmado.validade)) iniciarOcr();
    else {
      $("miraTexto").classList.add("completo");
      $("dicaLote").innerHTML = "Lido do código! Confira e toque em <strong>Salvar</strong>";
    }
  }

  function fecharTelaLote() {
    pararOcr();
    desligarCamera();
    mostrarTela("telaLista");
  }

  function salvarLote(proximo) {
    const erro = $("erroForm");
    erro.classList.add("hidden");
    const lote = $("loteLote").value.trim().toUpperCase();
    const validadeDigitada = $("loteValidade").value.trim();
    const produto = $("loteProduto").value.trim();

    if (!lote && !validadeDigitada) {
      erro.textContent = "Informe pelo menos o lote ou a validade.";
      erro.classList.remove("hidden");
      return;
    }
    let validade = null;
    if (validadeDigitada) {
      validade = P.lerDataDigitada(validadeDigitada);
      if (!validade) {
        erro.textContent = "Validade não reconhecida. Use dd/mm/aaaa ou mm/aaaa.";
        erro.classList.remove("hidden");
        return;
      }
    }

    const repetido = registros.find(
      (r) => r.ean === eanAtual && r.lote === lote && (r.validade || "") === (validade ? validade.texto : "")
    );
    if (repetido && !confirm("Este produto com este lote e validade já foi registrado. Registrar de novo?")) return;

    if (produto) produtos[eanAtual] = produto;
    gravarJson(CHAVE_PRODUTOS, produtos);

    registros.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      ean: eanAtual,
      produto,
      lote,
      validade: validade ? validade.texto : "",
      validadeIso: validade ? validade.iso : "",
      registradoEm: new Date().toISOString(),
    });
    gravarJson(CHAVE_REGISTROS, registros);
    renderizarLista();
    avisar("Registro salvo ✓");

    pararOcr();
    if (proximo) {
      // Mantém a câmera ligada e volta direto para o leitor de código.
      $("erroBarcode").classList.add("hidden");
      mostrarTela("telaBarcode");
      mostrarCameraEm($("videoBarcode"))
        .then(() => prepararLeitorBarcode())
        .then(() => {
          barcodeAtivo = true;
          cicloBarcode();
        })
        .catch((e) => {
          $("erroBarcode").textContent = mensagemErroCamera(e);
          $("erroBarcode").classList.remove("hidden");
        });
    } else {
      fecharTelaLote();
    }
  }

  // ------------------------------------------------------------------
  // Lista
  // ------------------------------------------------------------------

  function situacao(r) {
    if (!r.validadeIso) return { classe: "", rotulo: "sem validade" };
    const dias = diasAte(r.validadeIso);
    if (dias < 0) return { classe: "vencido", rotulo: dias === -1 ? "venceu ontem" : `vencido há ${-dias} dias` };
    if (dias === 0) return { classe: "proximo", rotulo: "vence hoje" };
    if (dias <= DIAS_ALERTA) return { classe: "proximo", rotulo: dias === 1 ? "vence amanhã" : `vence em ${dias} dias` };
    return { classe: "ok", rotulo: `vence em ${dias} dias` };
  }

  function renderizarLista() {
    const termo = P.normalizar($("busca").value).trim();
    const ordenados = [...registros].sort((a, b) => {
      if (!a.validadeIso) return 1;
      if (!b.validadeIso) return -1;
      return a.validadeIso.localeCompare(b.validadeIso);
    });

    let vencidos = 0;
    let proximos = 0;
    let ok = 0;
    registros.forEach((r) => {
      const c = situacao(r).classe;
      if (c === "vencido") vencidos++;
      else if (c === "proximo") proximos++;
      else if (c === "ok") ok++;
    });
    $("resumo").innerHTML = registros.length
      ? `<div class="vencido"><strong>${vencidos}</strong><span>vencidos</span></div>
         <div class="proximo"><strong>${proximos}</strong><span>vencem em ${DIAS_ALERTA} dias</span></div>
         <div class="ok"><strong>${ok}</strong><span>no prazo</span></div>`
      : "";

    const filtrados = termo
      ? ordenados.filter((r) => P.normalizar(`${r.produto} ${r.ean} ${r.lote}`).includes(termo))
      : ordenados;

    $("lista").innerHTML = filtrados
      .map((r) => {
        const s = situacao(r);
        return `<li class="item ${s.classe}" data-id="${escapar(r.id)}">
          <span class="nome">${escapar(r.produto || "Produto " + r.ean)}</span>
          <span class="detalhe">Lote <b>${escapar(r.lote || "—")}</b></span>
          <span class="detalhe">${escapar(r.ean)}</span>
          <span class="val"><strong>${escapar(r.validade || "—")}</strong><span>${escapar(s.rotulo)}</span></span>
        </li>`;
      })
      .join("");
    $("vazio").classList.toggle("hidden", registros.length > 0);
    $("busca").classList.toggle("hidden", registros.length === 0);
  }

  // ------------------------------------------------------------------
  // Edição de um registro
  // ------------------------------------------------------------------

  let idEditando = null;

  function abrirEdicao(id) {
    const r = registros.find((x) => x.id === id);
    if (!r) return;
    idEditando = id;
    $("edEan").value = r.ean;
    $("edProduto").value = r.produto;
    $("edLote").value = r.lote;
    $("edValidade").value = r.validade;
    $("edErro").classList.add("hidden");
    $("dlgEditar").showModal();
  }

  function salvarEdicao(ev) {
    ev.preventDefault();
    const r = registros.find((x) => x.id === idEditando);
    if (!r) return $("dlgEditar").close();
    const validadeTxt = $("edValidade").value.trim();
    const validade = validadeTxt ? P.lerDataDigitada(validadeTxt) : null;
    if (validadeTxt && !validade) {
      $("edErro").textContent = "Validade não reconhecida. Use dd/mm/aaaa ou mm/aaaa.";
      $("edErro").classList.remove("hidden");
      return;
    }
    r.ean = limparCodigo($("edEan").value);
    r.produto = $("edProduto").value.trim();
    r.lote = $("edLote").value.trim().toUpperCase();
    r.validade = validade ? validade.texto : "";
    r.validadeIso = validade ? validade.iso : "";
    if (r.produto && r.ean) {
      produtos[r.ean] = r.produto;
      gravarJson(CHAVE_PRODUTOS, produtos);
    }
    gravarJson(CHAVE_REGISTROS, registros);
    renderizarLista();
    $("dlgEditar").close();
  }

  function excluirRegistro() {
    if (!confirm("Excluir este registro?")) return;
    registros = registros.filter((x) => x.id !== idEditando);
    gravarJson(CHAVE_REGISTROS, registros);
    renderizarLista();
    $("dlgEditar").close();
  }

  // ------------------------------------------------------------------
  // Exportar / importar
  // ------------------------------------------------------------------

  function celulaCsv(v) {
    const s = String(v ?? "");
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  async function exportarCsv() {
    if (!registros.length) return avisar("Nenhum registro para exportar.");
    const linhas = [["Código de barras", "Produto", "Lote", "Validade", "Situação", "Registrado em"]];
    [...registros]
      .sort((a, b) => (a.validadeIso || "9999").localeCompare(b.validadeIso || "9999"))
      .forEach((r) =>
        linhas.push([
          // O ="..." impede o Excel de transformar o código em 7,89E+12.
          r.ean ? `="${r.ean}"` : "",
          r.produto,
          r.lote,
          r.validade,
          situacao(r).rotulo,
          new Date(r.registradoEm).toLocaleString("pt-BR"),
        ])
      );
    const csv = "﻿" + linhas.map((l) => l.map(celulaCsv).join(";")).join("\r\n");
    const nome = `lotes-validades-${hojeIso()}.csv`;
    const arquivo = new File([csv], nome, { type: "text/csv" });

    if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      try {
        await navigator.share({ files: [arquivo], title: "Lotes e validades" });
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    }
    const url = URL.createObjectURL(arquivo);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function importarProdutos(arquivo) {
    const texto = await arquivo.text();
    let n = 0;
    texto.split(/\r?\n/).forEach((linha) => {
      // Aceita ; , ou tab; tira aspas e o ="..." que o Excel às vezes coloca.
      const partes = linha.split(/[;\t,]/).map((p) => p.trim().replace(/^=/, "").replace(/^"|"$/g, ""));
      const codigo = limparCodigo(partes[0]);
      const nome = partes.slice(1).join(" ").trim();
      if (/^\d{6,14}$/.test(codigo) && nome) {
        produtos[codigo] = nome;
        n++;
      }
    });
    gravarJson(CHAVE_PRODUTOS, produtos);
    avisar(n ? `${n} produtos importados ✓` : "Nenhum produto encontrado no arquivo.");
  }

  // ------------------------------------------------------------------
  // Eventos
  // ------------------------------------------------------------------

  $("btnBipar").addEventListener("click", abrirLeitorBarcode);
  $("btnCancelarBarcode").addEventListener("click", fecharLeitorBarcode);
  $("btnLanternaBarcode").addEventListener("click", alternarLanterna);
  $("btnLanternaLote").addEventListener("click", alternarLanterna);

  // Código digitado ou vindo de um leitor USB/Bluetooth (que "digita" + Enter).
  $("formCodigo").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const codigo = $("inputCodigo").value;
    $("inputCodigo").value = "";
    $("inputCodigo").blur();
    if (limparCodigo(codigo)) codigoLido(codigo);
  });

  $("btnLerDeNovo").addEventListener("click", () => {
    editadoPeloUsuario = { lote: false, validade: false };
    $("loteLote").value = "";
    $("loteValidade").value = "";
    $("dicaLote").innerHTML = "Mire no <strong>lote</strong> e na <strong>validade</strong>";
    reiniciarLeituraOcr();
    if (stream) iniciarOcr();
  });

  [
    ["loteLote", "lote"],
    ["loteValidade", "validade"],
  ].forEach(([id, campo]) => {
    $(id).addEventListener("input", () => {
      // O que a pessoa digitou não é sobrescrito pela câmera.
      editadoPeloUsuario[campo] = true;
      confirmado[campo] = true;
      atualizarEstadoCampos();
      if (confirmado.lote && confirmado.validade) pararOcr();
    });
  });

  $("formLote").addEventListener("submit", (ev) => {
    ev.preventDefault();
    salvarLote(false);
  });
  $("btnSalvarProximo").addEventListener("click", () => salvarLote(true));
  $("btnCancelarLote").addEventListener("click", fecharTelaLote);

  $("busca").addEventListener("input", renderizarLista);
  $("lista").addEventListener("click", (ev) => {
    const li = ev.target.closest(".item");
    if (li) abrirEdicao(li.dataset.id);
  });

  $("formEditar").addEventListener("submit", salvarEdicao);
  $("edCancelar").addEventListener("click", () => $("dlgEditar").close());
  $("edExcluir").addEventListener("click", excluirRegistro);

  $("btnMenu").addEventListener("click", () => $("dlgMenu").showModal());
  $("btnExportar").addEventListener("click", () => {
    $("dlgMenu").close();
    exportarCsv();
  });
  $("btnImportarProdutos").addEventListener("click", () => $("arquivoProdutos").click());
  $("arquivoProdutos").addEventListener("change", async (ev) => {
    const arq = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!arq) return;
    $("dlgMenu").close();
    await importarProdutos(arq);
  });
  $("btnLimpar").addEventListener("click", () => {
    if (!registros.length) return avisar("Não há registros para apagar.");
    if (!confirm(`Apagar todos os ${registros.length} registros? Exporte a planilha antes se precisar deles.`)) return;
    registros = [];
    gravarJson(CHAVE_REGISTROS, registros);
    renderizarLista();
    $("dlgMenu").close();
  });

  // Ao sair do app a câmera é desligada; ao voltar, religa na tela certa.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (telaAtual !== "telaLista") desligarCamera();
      return;
    }
    if (telaAtual === "telaBarcode") abrirLeitorBarcode();
    else if (telaAtual === "telaLote") {
      mostrarCameraEm($("videoLote"))
        .then(() => {
          if (!(confirmado.lote && confirmado.validade)) iniciarOcr();
        })
        .catch(() => {});
    }
  });

  window.addEventListener("popstate", () => {
    if (telaAtual === "telaBarcode") fecharLeitorBarcode();
    else if (telaAtual === "telaLote") fecharTelaLote();
  });

  renderizarLista();
  // Baixa o leitor de texto em segundo plano, para a tela do lote abrir pronta.
  prepararOcr().catch(() => {});
})();
