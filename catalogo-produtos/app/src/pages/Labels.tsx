import { useEffect, useMemo, useState } from 'react';
import { diagnosticar, enviarParaImpressora, nomeImpressora, type Diagnostico, type Impressora } from '../lib/browserprint';
import { eanSvg, isValidEan13 } from '../lib/ean';
import { eplCalibrar, gerarEpl, gerarEplFileiras, gerarEplTeste } from '../lib/epl';
import { useCatalog } from '../lib/catalog';
import { criarBusca } from '../lib/busca';
import {
  FILA_ETIQUETAS,
  FORMATOS,
  type FormatoEtiqueta,
  gerarZpl,
  gerarZplFileiras,
  gerarZplTeste,
  larguraFitaMm,
  moduloParaLargura,
  zplCalibrar,
  type ItemEtiqueta,
} from '../lib/zpl';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Impressão de etiquetas de código de barras na Zebra.
 *
 * Sai na linguagem nativa da impressora (EPL ou ZPL) em vez de imagem: o
 * código de barras é desenhado pela própria Zebra e fica muito mais nítido
 * para o leitor.
 *
 * A escolha da linguagem não é detalhe: a TLP 2844 é da linha Eltron e só
 * entende EPL. Mandar ZPL para ela não dá aviso nenhum — o trabalho morre
 * na fila do Windows com "Erro", que é o sintoma mais difícil de ligar à
 * causa.
 */

/** Característica da impressora e do rolo da loja, não de cada impressão. */
const PREF_LINGUAGEM = 'catalogo.etiquetas.linguagem';
const PREF_RIBBON = 'catalogo.etiquetas.ribbon';
const PREF_FORMATO = 'catalogo.etiquetas.formato';
const PREF_MEDIDA = 'catalogo.etiquetas.medida';

/** Opção que libera digitar as medidas do rolo. */
const CUSTOM = '__medido__';

type Medida = Pick<FormatoEtiqueta, 'larguraMm' | 'alturaMm' | 'colunas' | 'gapMm'>;

export function Labels() {
  const { products, loading } = useCatalog();
  const [q, setQ] = useState('');
  // fila indexada pelo código de barras, e carregando os próprios dados: a
  // entrada de nota manda produtos para cá sem depender do catálogo já
  // ter recarregado
  const [fila, setFila] = useState<Record<string, ItemEtiqueta>>({});
  const [formatoId, setFormatoId] = useState(() => localStorage.getItem(PREF_FORMATO) ?? FORMATOS[0]!.id);
  /**
   * Medidas do rolo, em milímetros. Rolo de fornecedor varia — 33×22 de um
   * é 32×21 de outro — e errar por 2 mm basta para o conteúdo andar até
   * cair no picote. Por isso dá para digitar as medidas reais em vez de
   * depender de a lista ter exatamente o seu rolo.
   */
  const [medida, setMedida] = useState(() => {
    const salvo = localStorage.getItem(PREF_MEDIDA);
    if (salvo) { try { return JSON.parse(salvo) as Medida; } catch { /* usa o padrão */ } }
    const f = FORMATOS[0]!;
    return { larguraMm: f.larguraMm, alturaMm: f.alturaMm, colunas: f.colunas, gapMm: f.gapMm };
  });
  const [darkness, setDarkness] = useState(10);
  /*
   * Linguagem e ribbon ficam guardados no aparelho: são característica da
   * impressora da loja, não escolha de cada impressão. Reconfigurar a cada
   * visita é o caminho mais curto para mandar a linguagem errada — e ela
   * não avisa, o trabalho só morre em "Erro".
   */
  const [linguagem, setLinguagem] = useState<'epl' | 'zpl'>(
    () => (localStorage.getItem(PREF_LINGUAGEM) as 'epl' | 'zpl' | null) ?? 'epl',
  );
  const [ribbon, setRibbon] = useState(() => localStorage.getItem(PREF_RIBBON) !== 'nao');
  useEffect(() => { localStorage.setItem(PREF_LINGUAGEM, linguagem); }, [linguagem]);
  useEffect(() => { localStorage.setItem(PREF_RIBBON, ribbon ? 'sim' : 'nao'); }, [ribbon]);
  // etiqueta pequena não tem altura para nome e código: o código vem antes
  const [mostrarNome, setMostrarNome] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [zebras, setZebras] = useState<Impressora[]>([]);
  const [zebraUid, setZebraUid] = useState('');
  const [enviando, setEnviando] = useState(false);

  const [procurando, setProcurando] = useState(true);
  const [diag, setDiag] = useState<Diagnostico | null>(null);

  /**
   * Procura o Zebra Browser Print na máquina. Só com ele a etiqueta sai sem
   * passar pela janela de impressão — navegador nenhum deixa uma página
   * mandar para a impressora sozinha, por segurança.
   */
  function procurarImpressoras() {
    setProcurando(true);
    diagnosticar()
      .then((d) => {
        setDiag(d);
        const ps = d.estado === 'ok' ? d.impressoras : [];
        setZebras(ps);
        if (ps[0]) setZebraUid(ps[0].uid);
      })
      .finally(() => setProcurando(false));
  }
  useEffect(procurarImpressoras, []);

  const formato: FormatoEtiqueta =
    formatoId === CUSTOM
      ? { id: CUSTOM, label: `${medida.larguraMm} × ${medida.alturaMm} mm — ${medida.colunas} coluna(s)`, ...medida }
      : FORMATOS.find((f) => f.id === formatoId)!;

  useEffect(() => { localStorage.setItem(PREF_FORMATO, formatoId); }, [formatoId]);
  useEffect(() => { localStorage.setItem(PREF_MEDIDA, JSON.stringify(medida)); }, [medida]);

  /** Trocar de preset leva as medidas junto, para o modo manual partir delas. */
  function escolherFormato(id: string) {
    setFormatoId(id);
    const f = FORMATOS.find((x) => x.id === id);
    if (f) setMedida({ larguraMm: f.larguraMm, alturaMm: f.alturaMm, colunas: f.colunas, gapMm: f.gapMm });
  }

  // só produto com EAN-13 válido pode virar etiqueta
  const buscaveis = useMemo(
    () => products.filter((p) => p.barcode && isValidEan13(p.barcode)),
    [products],
  );

  const resultados = useMemo(() => {
    const casa = criarBusca(q);
    if (!casa) return [];
    return buscaveis
      .filter((p) => casa(`${p.name} ${p.brand ?? ''} ${p.barcode}`))
      .slice(0, 30);
  }, [q, buscaveis]);

  const itens = useMemo(() => Object.values(fila), [fila]);

  const totalEtiquetas = itens.reduce((s, i) => s + i.copias, 0);

  /** Etiquetas agrupadas em fileiras, do mesmo jeito que saem na fita. */
  const fileiras = useMemo(() => {
    const todas = itens.flatMap((i) => Array.from({ length: i.copias }, () => i));
    const linhas: ItemEtiqueta[][] = [];
    for (let i = 0; i < todas.length; i += formato.colunas) {
      linhas.push(todas.slice(i, i + formato.colunas));
    }
    return linhas;
  }, [itens, formato.colunas]);
  const zpl = useMemo(
    () =>
      linguagem === 'epl'
        ? gerarEpl(itens, { formato, densidade: darkness, mostrarNome })
        : gerarZpl(itens, { formato, darkness, mostrarNome, ribbon }),
    [itens, formato, darkness, mostrarNome, linguagem, ribbon],
  );
  /**
   * Uma fileira por elemento — é o que vai pra impressão direta. Mandar a
   * fila inteira (etiquetagem grande, 60-70+ etiquetas) num só `/write` já
   * derrubou o Browser Print com erro 500; fileira por fileira cada
   * chamada é pequena e a impressora processa conforme chega.
   */
  const zplFileiras = useMemo(
    () =>
      linguagem === 'epl'
        ? gerarEplFileiras(itens, { formato, densidade: darkness, mostrarNome })
        : gerarZplFileiras(itens, { formato, darkness, mostrarNome, ribbon }),
    [itens, formato, darkness, mostrarNome, linguagem, ribbon],
  );

  function addProduto(nome: string, barcode: string) {
    setFila((f) => ({
      ...f,
      [barcode]: { nome, barcode, copias: (f[barcode]?.copias ?? 0) + 1 },
    }));
    setQ('');
  }
  function setCopias(barcode: string, n: number) {
    setFila((f) => {
      const next = { ...f };
      if (n <= 0) delete next[barcode];
      else if (next[barcode]) next[barcode] = { ...next[barcode]!, copias: n };
      return next;
    });
  }

  // fila mandada por outra tela (entrada de nota)
  useEffect(() => {
    const salvo = localStorage.getItem(FILA_ETIQUETAS);
    if (!salvo) return;
    localStorage.removeItem(FILA_ETIQUETAS);
    try {
      const vindos = JSON.parse(salvo) as ItemEtiqueta[];
      setFila((f) => {
        const next = { ...f };
        for (const i of vindos) {
          if (!i.barcode) continue;
          next[i.barcode] = { ...i, copias: (next[i.barcode]?.copias ?? 0) + i.copias };
        }
        return next;
      });
    } catch {
      // fila corrompida: ignora e segue com a tela vazia
    }
  }, []);

  function baixarZpl() {
    const blob = new Blob([zpl], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `etiquetas-${new Date().toISOString().slice(0, 10)}.${linguagem}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copiarZpl() {
    await navigator.clipboard.writeText(zpl);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  /**
   * Caminho de melhor qualidade: manda os comandos direto, na linguagem
   * escolhida, e a impressora desenha o código de barras.
   */
  async function imprimirDireto(conteudo = zpl) {
    const z = zebras.find((p) => p.uid === zebraUid);
    if (!z) return;
    setEnviando(true);
    setAviso(null);
    try {
      const r = await enviarParaImpressora(z, conteudo);
      setAviso(r.ok ? `Enviado para ${nomeImpressora(z)}.` : `Não consegui imprimir — ${r.erro}`);
    } finally {
      setEnviando(false);
    }
  }

  /**
   * Manda a fila inteira, fileira por fileira, em vez de um payload só —
   * ver o comentário de `zplFileiras`. Para no primeiro erro e conta pra
   * quem está vendo quantas já saíram, já que um lote grande pode ter
   * ido em parte antes de travar.
   */
  async function imprimirTudo() {
    const z = zebras.find((p) => p.uid === zebraUid);
    if (!z || zplFileiras.length === 0) return;
    setEnviando(true);
    setAviso(null);
    try {
      for (let i = 0; i < zplFileiras.length; i++) {
        const r = await enviarParaImpressora(z, zplFileiras[i]!);
        if (!r.ok) {
          setAviso(
            `Enviei ${i} de ${zplFileiras.length} fileiras e travou — ${r.erro}. ` +
              'As etiquetas já enviadas devem ter saído; tente de novo para o resto.',
          );
          return;
        }
        setAviso(`Enviando… ${i + 1}/${zplFileiras.length}`);
        if (i < zplFileiras.length - 1) await sleep(150);
      }
      setAviso(`Enviado para ${nomeImpressora(z)} — ${zplFileiras.length} fileira${zplFileiras.length === 1 ? '' : 's'}.`);
    } finally {
      setEnviando(false);
    }
  }

  /** Faz a impressora medir o vão entre as etiquetas antes de imprimir. */
  async function calibrar() {
    const cmd = linguagem === 'epl' ? eplCalibrar() : zplCalibrar();
    if (zebras.length > 0) {
      await imprimirDireto(cmd);
      setAviso('Calibração enviada — a impressora vai puxar algumas etiquetas medindo o vão.');
      return;
    }
    await navigator.clipboard.writeText(cmd);
    setAviso('Comando de calibração copiado — cole no Zebra Setup Utilities e envie.');
  }

  /** Uma fileira com moldura, para conferir tamanho e alinhamento do rolo. */
  async function imprimirTeste() {
    const teste =
      linguagem === 'epl'
        ? gerarEplTeste({ formato, densidade: darkness })
        : gerarZplTeste({ formato, darkness, ribbon });
    if (zebras.length > 0) {
      await imprimirDireto(teste);
      return;
    }
    await navigator.clipboard.writeText(teste);
    setAviso(`${linguagem.toUpperCase()} de teste copiado — cole no Zebra Setup Utilities e envie.`);
  }

  return (
    <main className="content">
      <div className="page-head">
        <a href="#/" className="back">‹ Início</a>
        <h1>Etiquetas</h1>
      </div>
      <p className="muted review-hint">
        Monte a fila, confira o tamanho e imprima. Com o Zebra Browser Print
        instalado aparece <strong>Imprimir na Zebra</strong>, que manda os
        comandos direto e não abre a janela de impressão. Sem ele restam{' '}
        <strong>Imprimir</strong> pelo navegador, <strong>Copiar</strong> para
        colar no Zebra Setup Utilities e <strong>Baixar</strong> em arquivo.
        <br />
        Confira a <strong>linguagem</strong>: a TLP 2844 e as outras da linha
        Eltron falam <strong>EPL</strong>, as mais novas falam{' '}
        <strong>ZPL</strong> — mandar a errada faz o trabalho morrer em "Erro"
        sem explicação.
      </p>

      <div className="etq-busca">
        <input
          type="search"
          placeholder="Buscar por nome, marca ou código — use % entre palavras"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {resultados.length > 0 && (
          <ul className="etq-resultados">
            {resultados.map((p) => (
              <li key={p.id}>
                <button onClick={() => addProduto(p.name, p.barcode!)}>
                  <span className="etq-res-nome">{p.name}</span>
                  <span className="mono tiny muted">{p.barcode}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {q && resultados.length === 0 && !loading && (
          <p className="muted small">
            Nenhum produto com código de barras válido. Produtos sem EAN podem
            receber um código interno na tela de edição.
          </p>
        )}
      </div>

      {itens.length > 0 && (
        <>
          <div className="etq-config">
            <label>
              Tamanho
              <select value={formatoId} onChange={(e) => escolherFormato(e.target.value)}>
                {FORMATOS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                <option value={CUSTOM}>Medir o meu rolo…</option>
              </select>
            </label>
            {formatoId === CUSTOM && (
              <div className="etq-medir">
                {([
                  ['larguraMm', 'Largura'],
                  ['alturaMm', 'Altura'],
                  ['colunas', 'Colunas'],
                  ['gapMm', 'Vão'],
                ] as [keyof Medida, string][]).map(([campo, rotulo]) => (
                  <label key={campo}>
                    {rotulo}{campo === 'colunas' ? '' : ' (mm)'}
                    <input
                      type="number"
                      min={campo === 'colunas' ? 1 : 0}
                      max={campo === 'colunas' ? 6 : 200}
                      step={campo === 'colunas' ? 1 : 0.5}
                      value={medida[campo]}
                      onChange={(e) =>
                        setMedida((m) => ({ ...m, [campo]: Number(e.target.value) || 0 }))
                      }
                    />
                  </label>
                ))}
              </div>
            )}
            <label>
              Linguagem
              <select value={linguagem} onChange={(e) => setLinguagem(e.target.value as 'epl' | 'zpl')}>
                <option value="epl">EPL — TLP 2844, LP 2844, TLP 2824</option>
                <option value="zpl">ZPL — ZD220, ZD230, GC420, GK420, ZD421</option>
              </select>
            </label>
            {linguagem === 'zpl' && (
              <label>
                Mídia
                <select value={ribbon ? 'ribbon' : 'direta'} onChange={(e) => setRibbon(e.target.value === 'ribbon')}>
                  <option value="ribbon">Com ribbon (transferência térmica)</option>
                  <option value="direta">Sem ribbon (térmica direta)</option>
                </select>
              </label>
            )}
            <label>
              Escurecimento
              <input
                type="number"
                min={0}
                max={linguagem === 'epl' ? 15 : 30}
                value={darkness}
                onChange={(e) => setDarkness(Number(e.target.value))}
              />
            </label>
            <label className="etq-check">
              <input
                type="checkbox"
                checked={mostrarNome}
                onChange={(e) => setMostrarNome(e.target.checked)}
              />
              Imprimir o nome
            </label>
            <button className="secondary" onClick={calibrar} disabled={enviando}>
              📏 Calibrar
            </button>
            <button className="secondary" onClick={imprimirTeste} disabled={enviando}>
              📐 Imprimir teste
            </button>
          </div>

          <p className="tiny muted etq-medidas">
            Fita de <strong>{larguraFitaMm(formato)} mm</strong> ({formato.colunas} ×{' '}
            {formato.larguraMm} mm{formato.colunas > 1 && ` + ${formato.gapMm} mm entre colunas`}) ·
            módulo do código {(moduloParaLargura(formato.larguraMm) * 25.4 / 203).toFixed(2)} mm ·{' '}
            código ocupa {(113 * moduloParaLargura(formato.larguraMm) * 25.4 / 203).toFixed(1)} mm
            dos {formato.larguraMm} mm da etiqueta.
            {moduloParaLargura(formato.larguraMm) * 25.4 / 203 < 0.264 && (
              <> <strong>Abaixo do tamanho recomendado pela GS1</strong> — funciona com leitor
              de perto, mas teste antes de imprimir o rolo todo.</>
            )}
          </p>

          <ul className="etq-fila">
            {itens.map((i) => (
              <li key={i.barcode} className="etq-item">
                <div
                  className="etq-preview"
                  // svg gerado aqui mesmo, sem entrada externa
                  dangerouslySetInnerHTML={{ __html: eanSvg(i.barcode, { modulo: 2, altura: 44 }) }}
                />
                <div className="etq-item-info">
                  <span className="etq-item-nome">{i.nome}</span>
                  <span className="mono tiny muted">{i.barcode}</span>
                </div>
                <div className="etq-copias">
                  <button onClick={() => setCopias(i.barcode, i.copias - 1)} aria-label="Menos uma">−</button>
                  <input
                    type="number"
                    min={1}
                    value={i.copias}
                    onChange={(e) => setCopias(i.barcode, Number(e.target.value))}
                  />
                  <button onClick={() => setCopias(i.barcode, i.copias + 1)} aria-label="Mais uma">+</button>
                </div>
                <button className="cart-del" onClick={() => setCopias(i.barcode, 0)} aria-label="Tirar da fila">✕</button>
              </li>
            ))}
          </ul>

          <div className="etq-acoes">
            <span className="muted small">
              {totalEtiquetas} etiqueta{totalEtiquetas === 1 ? '' : 's'} · {formato.label}
            </span>
            {zebras.length > 0 ? (
              <>
                {zebras.length > 1 && (
                  <select value={zebraUid} onChange={(e) => setZebraUid(e.target.value)}>
                    {zebras.map((z) => <option key={z.uid} value={z.uid}>{nomeImpressora(z)}</option>)}
                  </select>
                )}
                <button className="primary" onClick={imprimirTudo} disabled={enviando}>
                  {enviando ? 'Enviando…' : '🖨️ Imprimir na Zebra'}
                </button>
                <button className="secondary" onClick={() => window.print()}>Imprimir pelo navegador</button>
              </>
            ) : (
              <button className="primary" onClick={() => window.print()}>🖨️ Imprimir</button>
            )}
            <button className="secondary" onClick={copiarZpl}>
              {copiado ? 'Copiado!' : `Copiar ${linguagem.toUpperCase()}`}
            </button>
            <button className="secondary" onClick={baixarZpl}>Baixar arquivo</button>
            <button className="secondary" onClick={() => setFila({})}>Limpar</button>
          </div>
          {aviso && <p className="nf-ok">{aviso}</p>}

          {zebras.length > 0 ? (
            <p className="tiny muted etq-dica">
              ✓ Impressão direta ligada — a etiqueta sai sem abrir a janela de
              impressão, e o código de barras é desenhado pela própria Zebra.
            </p>
          ) : (
            <div className="etq-setup">
              {diag?.estado === 'sem-impressora' ? (
                <>
                  <strong className="small">Programa achado, mas sem impressora</strong>
                  <p className="tiny">
                    O Zebra Browser Print está rodando ({diag.porta}), só que não
                    enxerga nenhuma impressora. Confira se ela está ligada e
                    conectada, e se aparece em <strong>Dispositivos e
                    Impressoras</strong> do Windows. Se acabou de ligá-la, feche e
                    abra o Browser Print pela bandeja do sistema.
                  </p>
                </>
              ) : (
                <>
                  <strong className="small">Imprimir sem abrir a janela de impressão</strong>
                  <p className="tiny">
                    Nenhum navegador deixa uma página mandar direto para a
                    impressora — é trava de segurança, e a janela sempre aparece.
                    Quem resolve isso é o <strong>Zebra Browser Print</strong>, um
                    programinha gratuito da própria Zebra: instalado, o botão daqui
                    manda os comandos direto e a etiqueta sai na hora.
                  </p>
                  <ol className="tiny">
                    <li>
                      Baixe em{' '}
                      <a href="https://www.zebra.com/br/pt/support-downloads/printer-software/by-product/browser-print.html" target="_blank" rel="noopener noreferrer">
                        zebra.com → Browser Print ↗
                      </a>{' '}
                      (pede um cadastro gratuito).
                    </li>
                    <li>Instale e deixe o programa aberto — ele fica no relógio do Windows.</li>
                    <li>
                      Abra{' '}
                      <a href="https://localhost:9101/ssl_support" target="_blank" rel="noopener noreferrer">
                        https://localhost:9101/ssl_support ↗
                      </a>{' '}
                      e aceite o certificado. Sem isso o site não consegue falar com ele.
                    </li>
                    <li>
                      Nas configurações do Browser Print, deixe a impressora marcada
                      em <strong>Default Device</strong> — em algumas versões a
                      varredura vem vazia e é só de lá que ela aparece.
                    </li>
                    <li>Volte aqui e clique em procurar.</li>
                  </ol>
                  {diag?.estado === 'sem-programa' && (
                    <>
                      <p className="tiny muted">Nenhuma resposta nos endereços testados:</p>
                      <pre className="etq-diag">{diag.detalhe.split(' · ').join('\n')}</pre>
                      <p className="tiny muted">
                        "TimeoutError" ou "TypeError" costuma ser o programa fechado
                        ou o certificado recusado. Se aparecer bloqueio de rede
                        privada, é o Chrome barrando o acesso ao localhost — abra{' '}
                        <strong>chrome://flags/#block-insecure-private-network-requests</strong>{' '}
                        e mude para <strong>Disabled</strong>.
                      </p>
                    </>
                  )}
                </>
              )}
              <button className="secondary" onClick={procurarImpressoras} disabled={procurando}>
                {procurando ? 'Procurando…' : '🔄 Procurar impressora'}
              </button>
            </div>
          )}


          {/*
            Folha de impressão: só aparece no papel, no tamanho exato da
            etiqueta. Esconde o resto por visibility em vez de display —
            assim não depende de onde a folha está na árvore da página.
          */}
          <style>{`
            @media print {
              @page { size: ${larguraFitaMm(formato)}mm ${formato.alturaMm}mm; margin: 0; }
              body * { visibility: hidden !important; }
              .etq-folha, .etq-folha * { visibility: visible !important; }
              .etq-folha {
                display: block !important;
                position: absolute !important;
                left: 0; top: 0; margin: 0; padding: 0;
              }
              .etq-fileira { gap: ${formato.gapMm}mm; }
            }
          `}</style>
          <div className="etq-folha" aria-hidden>
            {fileiras.map((fileira, fi) => (
              <div
                key={fi}
                className="etq-fileira"
                style={{ width: `${larguraFitaMm(formato)}mm`, height: `${formato.alturaMm}mm` }}
              >
                {fileira.map((i, ci) => (
                  <div
                    key={`${i.barcode}-${ci}`}
                    className="etq-papel"
                    style={{ width: `${formato.larguraMm}mm`, height: `${formato.alturaMm}mm` }}
                  >
                    {mostrarNome && <span className="etq-papel-nome">{i.nome}</span>}
                    <div
                      className="etq-papel-cod"
                      dangerouslySetInnerHTML={{
                        __html: eanSvg(i.barcode, { modulo: 2, altura: mostrarNome ? 46 : 60 }),
                      }}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>

          <details className="etq-zpl">
            <summary>Ver o {linguagem.toUpperCase()} gerado</summary>
            <pre>{zpl}</pre>
          </details>
        </>
      )}

      {itens.length === 0 && !loading && (
        <p className="muted center-msg">Busque um produto acima para começar a fila.</p>
      )}
    </main>
  );
}
