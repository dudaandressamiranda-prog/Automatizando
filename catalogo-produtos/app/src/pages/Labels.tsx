import { useEffect, useMemo, useState } from 'react';
import { imprimirZpl, listarImpressoras, type Impressora } from '../lib/browserprint';
import { eanSvg, isValidEan13 } from '../lib/ean';
import { useCatalog } from '../lib/catalog';
import { norm } from '../lib/normalize';
import { FILA_ETIQUETAS, FORMATOS, gerarZpl, type ItemEtiqueta } from '../lib/zpl';

/**
 * Impressão de etiquetas de código de barras na Zebra.
 *
 * Sai em ZPL, a linguagem nativa da impressora, em vez de imagem: o código
 * de barras é desenhado pela própria Zebra e fica muito mais nítido para o
 * leitor. O arquivo baixado é enviado à impressora pelo Zebra Setup
 * Utilities (ou copiado direto para a fila, em rede).
 */
export function Labels() {
  const { products, loading } = useCatalog();
  const [q, setQ] = useState('');
  // fila indexada pelo código de barras, e carregando os próprios dados: a
  // entrada de nota manda produtos para cá sem depender do catálogo já
  // ter recarregado
  const [fila, setFila] = useState<Record<string, ItemEtiqueta>>({});
  const [formatoId, setFormatoId] = useState(FORMATOS[0]!.id);
  const [darkness, setDarkness] = useState(15);
  const [mostrarNome, setMostrarNome] = useState(true);
  const [copiado, setCopiado] = useState(false);
  const [zebras, setZebras] = useState<Impressora[]>([]);
  const [zebraUid, setZebraUid] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // procura o Zebra Browser Print na máquina; sem ele, sobra a impressão
  // normal do navegador, que funciona igual
  useEffect(() => {
    listarImpressoras().then((ps) => {
      setZebras(ps);
      if (ps[0]) setZebraUid(ps[0].uid);
    });
  }, []);

  const formato = FORMATOS.find((f) => f.id === formatoId)!;

  // só produto com EAN-13 válido pode virar etiqueta
  const buscaveis = useMemo(
    () => products.filter((p) => p.barcode && isValidEan13(p.barcode)),
    [products],
  );

  const resultados = useMemo(() => {
    const termo = norm(q);
    if (!termo) return [];
    return buscaveis
      .filter((p) => norm(`${p.name} ${p.brand ?? ''} ${p.barcode}`).includes(termo))
      .slice(0, 30);
  }, [q, buscaveis]);

  const itens = useMemo(() => Object.values(fila), [fila]);

  const totalEtiquetas = itens.reduce((s, i) => s + i.copias, 0);
  const zpl = useMemo(
    () => gerarZpl(itens, { formato, darkness, mostrarNome }),
    [itens, formato, darkness, mostrarNome],
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
    a.download = `etiquetas-${new Date().toISOString().slice(0, 10)}.zpl`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copiarZpl() {
    await navigator.clipboard.writeText(zpl);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  /** Caminho de melhor qualidade: ZPL direto, a Zebra desenha o código. */
  async function imprimirNaZebra() {
    const z = zebras.find((p) => p.uid === zebraUid);
    if (!z) return;
    setEnviando(true);
    setAviso(null);
    try {
      const ok = await imprimirZpl(z, zpl);
      setAviso(ok ? `Enviado para ${z.name}.` : 'Não consegui falar com a impressora. Ela está ligada?');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="content">
      <div className="page-head">
        <a href="#/" className="back">‹ Início</a>
        <h1>Etiquetas</h1>
      </div>
      <p className="muted review-hint">
        Monte a fila, escolha o tamanho da etiqueta e baixe o arquivo .zpl —
        ele vai direto para a Zebra pelo Zebra Setup Utilities (ou copiado
        para a fila da impressora, se ela estiver em rede). O código de
        barras é desenhado pela própria impressora, o que deixa a leitura
        bem mais confiável do que imprimir como imagem.
      </p>

      <div className="etq-busca">
        <input
          type="search"
          placeholder="Buscar produto por nome, marca ou código…"
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
              <select value={formatoId} onChange={(e) => setFormatoId(e.target.value)}>
                {FORMATOS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </label>
            <label>
              Escurecimento
              <input
                type="number"
                min={0}
                max={30}
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
          </div>

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
                    {zebras.map((z) => <option key={z.uid} value={z.uid}>{z.name}</option>)}
                  </select>
                )}
                <button className="primary" onClick={imprimirNaZebra} disabled={enviando}>
                  {enviando ? 'Enviando…' : '🖨️ Imprimir na Zebra'}
                </button>
                <button className="secondary" onClick={() => window.print()}>Imprimir pelo navegador</button>
              </>
            ) : (
              <button className="primary" onClick={() => window.print()}>🖨️ Imprimir</button>
            )}
            <button className="secondary" onClick={copiarZpl}>
              {copiado ? 'Copiado!' : 'Copiar ZPL'}
            </button>
            <button className="secondary" onClick={baixarZpl}>Baixar .zpl</button>
            <button className="secondary" onClick={() => setFila({})}>Limpar</button>
          </div>
          {aviso && <p className="nf-ok">{aviso}</p>}
          {zebras.length === 0 && (
            <p className="tiny muted etq-dica">
              O botão imprime pelo navegador, usando a Zebra como impressora
              comum — funciona sem instalar nada. Para o ZPL ir direto à
              impressora (código de barras desenhado por ela, leitura mais
              confiável), instale o <strong>Zebra Browser Print</strong> na
              máquina e recarregue esta página.
            </p>
          )}

          {/*
            Folha de impressão: só aparece no papel, no tamanho exato da
            etiqueta. Esconde o resto por visibility em vez de display —
            assim não depende de onde a folha está na árvore da página.
          */}
          <style>{`
            @media print {
              @page { size: ${formato.larguraMm}mm ${formato.alturaMm}mm; margin: 0; }
              body * { visibility: hidden !important; }
              .etq-folha, .etq-folha * { visibility: visible !important; }
              .etq-folha {
                display: block !important;
                position: absolute !important;
                left: 0; top: 0; margin: 0; padding: 0;
              }
            }
          `}</style>
          <div className="etq-folha" aria-hidden>
            {itens.flatMap((i) =>
              Array.from({ length: i.copias }, (_, n) => (
                <div
                  key={`${i.barcode}-${n}`}
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
              )),
            )}
          </div>

          <details className="etq-zpl">
            <summary>Ver o ZPL gerado</summary>
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
