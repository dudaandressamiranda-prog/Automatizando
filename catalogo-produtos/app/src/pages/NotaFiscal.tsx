import { useEffect, useMemo, useState } from 'react';
import { formataChave, formataCnpj, lerChave } from '../lib/chaveNfe';
import { completeEan13, eanSvg, isInternalEan, isValidEan13, nextInternalEan } from '../lib/ean';
import { buscarFotoPorEan } from '../lib/fotoweb';
import { norm } from '../lib/normalize';
import { parseNfe, type ItemNota, type Nota } from '../lib/nfe';
import { supabase } from '../lib/supabase';
import { useCatalog } from '../lib/catalog';
import { enviarParaEtiquetas, type ItemEtiqueta } from '../lib/zpl';
import type { ListProduct } from '../lib/types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const RASCUNHO = 'catalogo.nota.rascunho';

interface Variacao {
  key: string;
  nome: string;
  ean: string;
}

interface Linha {
  key: string;
  item: ItemNota;
  incluir: boolean;
  nome: string;
  ean: string;
  marca: string;
  categoriaId: string;
  fornecedor: string;
  photoUrl: string;
  /** Unidades por embalagem — vem da nota e pode ser corrigido. */
  fator: number;
  /** Etiquetas a imprimir. Começa na quantidade recebida na nota. */
  etiquetas: number;
  variacoes: Variacao[];
  aberto: boolean;
}

/**
 * Entrada de nota fiscal.
 *
 * O XML da NF-e traz descrição, EAN, fornecedor e a conversão de unidade
 * já resolvida; o que falta para virar produto de catálogo — categoria,
 * foto, nome apresentável — se preenche aqui antes de gravar. Nada entra
 * sem passar por esta tela.
 */
export function NotaFiscal() {
  const { products, categories } = useCatalog();
  const [nota, setNota] = useState<Nota | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [eansUsados, setEansUsados] = useState<string[]>([]);
  const [chave, setChave] = useState('');
  const [xmlColado, setXmlColado] = useState('');
  const [chaveCopiada, setChaveCopiada] = useState(false);
  /** Progresso da busca automática de fotos — null quando nunca rodou nesta nota. */
  const [buscaFotos, setBuscaFotos] = useState<
    { ativo: boolean; feito: number; total: number; achadas: number } | null
  >(null);

  const dadosChave = useMemo(() => lerChave(chave), [chave]);

  // códigos internos já em uso, para o gerador não repetir número
  useEffect(() => {
    (async () => {
      const usados: string[] = [];
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('products').select('barcode').like('barcode', '2%').range(from, from + 999);
        usados.push(...(data ?? []).map((r) => r.barcode as string).filter(Boolean));
        if (!data || data.length < 1000) break;
      }
      setEansUsados(usados);
    })();
  }, []);

  // rascunho: nota grande não se resolve numa sentada só
  useEffect(() => {
    const salvo = localStorage.getItem(RASCUNHO);
    if (!salvo) return;
    try {
      const d = JSON.parse(salvo) as { nota: Nota; linhas: Linha[] };
      setNota(d.nota);
      setLinhas(d.linhas);
    } catch {
      localStorage.removeItem(RASCUNHO);
    }
  }, []);

  useEffect(() => {
    if (nota) localStorage.setItem(RASCUNHO, JSON.stringify({ nota, linhas }));
  }, [nota, linhas]);

  /** Produtos do catálogo por código, para reconhecer o que já existe. */
  const porEan = useMemo(() => {
    const m = new Map<string, ListProduct>();
    for (const p of products) if (p.barcode) m.set(p.barcode, p);
    return m;
  }, [products]);

  const catPorId = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  /**
   * Sugere categoria olhando produtos parecidos que já estão no catálogo:
   * se "Ração Golden Adulto 15kg" já existe em Ração Seca, a linha nova da
   * mesma família provavelmente vai no mesmo lugar.
   */
  function sugerirCategoria(descricao: string): string {
    const toks = norm(descricao).split(/\s+/).filter((t) => t.length > 2).slice(0, 3);
    if (toks.length === 0) return '';
    const votos = new Map<string, number>();
    for (const p of products) {
      if (!p.category_id) continue;
      const n = norm(p.name);
      const acertos = toks.filter((t) => n.includes(t)).length;
      if (acertos >= 2) votos.set(p.category_id, (votos.get(p.category_id) ?? 0) + acertos);
    }
    const melhor = [...votos.entries()].sort((a, b) => b[1] - a[1])[0];
    return melhor ? melhor[0] : '';
  }

  async function carregarArquivo(file: File) {
    carregarXml(await file.text());
  }

  function carregarXml(texto: string) {
    setErro(null);
    setResultado(null);
    try {
      const n = parseNfe(texto);
      setNota(n);
      const novasLinhas: Linha[] = n.itens.map((item, i) => {
        const existente = item.ean ? porEan.get(item.ean) : undefined;
        const semFoto = !existente || !(existente.photo_path || existente.photo_source_url);
        return {
          key: `${item.numero}-${i}`,
          item,
          // já cadastrado e completo entra desmarcado — não mexe no que já
          // está pronto. Já cadastrado mas sem foto entra marcado: é
          // exatamente para reprocessar esse caso (achar a foto e ativar,
          // sem duplicar o cadastro) que dá pra carregar a mesma nota de novo.
          incluir: semFoto,
          // vem do cadastro atual quando o produto já existe — reprocessar
          // a nota não pode apagar nome, marca ou categoria que alguém já
          // tenha corrigido à mão desde a primeira entrada.
          nome: existente?.name ?? item.descricao,
          ean: item.ean ?? '',
          marca: existente?.brand ?? '',
          categoriaId: existente?.category_id ?? sugerirCategoria(item.descricao),
          fornecedor: n.fornecedor,
          photoUrl: existente?.photo_source_url ?? '',
          fator: item.fatorConversao,
          // uma etiqueta por unidade recebida é o padrão do balcão
          etiquetas: Math.max(0, Math.round(item.quantidadeComercial * item.fatorConversao)),
          variacoes: [],
          aberto: false,
        };
      });
      setLinhas(novasLinhas);
      setBuscaFotos(null);
      // nota carregada: já sai procurando a foto de quem ainda não tem —
      // item novo ou já cadastrado, sem precisar rodar nada por fora do app
      void buscarFotosEmLote(
        novasLinhas.filter((l) => !l.photoUrl.trim()).map((l) => ({ key: l.key, ean: l.ean })),
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  function editar(key: string, mudanca: Partial<Linha>) {
    setLinhas((ls) => ls.map((l) => (l.key === key ? { ...l, ...mudanca } : l)));
  }

  /**
   * Busca a foto de cada item da lista, um de cada vez — mesma cortesia do
   * robô do importador (uma pausa entre chamadas) para não sair batendo
   * nas lojas em paralelo. Código interno nunca entra na lista: não existe
   * em loja nenhuma, a busca só gastaria tempo para sempre voltar vazia.
   */
  async function buscarFotosEmLote(itens: { key: string; ean: string }[]) {
    const alvo = itens.filter((i) => isValidEan13(i.ean) && !isInternalEan(i.ean));
    if (alvo.length === 0) return;
    setBuscaFotos({ ativo: true, feito: 0, total: alvo.length, achadas: 0 });
    let achadas = 0;
    for (let i = 0; i < alvo.length; i++) {
      const hit = await buscarFotoPorEan(alvo[i]!.ean);
      if (hit) {
        achadas++;
        editar(alvo[i]!.key, { photoUrl: hit.image });
      }
      setBuscaFotos({ ativo: true, feito: i + 1, total: alvo.length, achadas });
      if (i < alvo.length - 1) await sleep(350);
    }
    setBuscaFotos((s) => (s ? { ...s, ativo: false } : s));
  }

  /** Item sem foto ainda: busca de novo — usado no botão "Buscar fotos". */
  function buscarFotosPendentes() {
    const alvo = linhas
      .filter((l) => !l.photoUrl.trim())
      .map((l) => ({ key: l.key, ean: l.ean.trim() }));
    void buscarFotosEmLote(alvo);
  }

  /**
   * Troca o código de barras da linha e, se o novo código é um EAN de
   * verdade (não interno), já dispara a busca da foto na hora — é o que
   * fecha o ciclo de "preencheu o código que faltava" sem precisar lembrar
   * de clicar em mais nada depois.
   */
  function onEanChange(key: string, novoEan: string) {
    editar(key, { ean: novoEan });
    const limpo = novoEan.trim();
    if (isValidEan13(limpo) && !isInternalEan(limpo)) void buscarFotosEmLote([{ key, ean: limpo }]);
  }

  /** Gera código interno e já reserva para não sair repetido na mesma nota. */
  function gerarEan(): string {
    const novo = nextInternalEan(eansUsados);
    setEansUsados((u) => [...u, novo]);
    return novo;
  }

  function addVariacao(key: string) {
    setLinhas((ls) =>
      ls.map((l) =>
        l.key === key
          ? {
              ...l,
              variacoes: [
                ...l.variacoes,
                { key: `${key}-v${l.variacoes.length + 1}-${Date.now()}`, nome: '', ean: gerarEan() },
              ],
            }
          : l,
      ),
    );
  }

  function editarVariacao(key: string, vKey: string, mudanca: Partial<Variacao>) {
    setLinhas((ls) =>
      ls.map((l) =>
        l.key === key
          ? { ...l, variacoes: l.variacoes.map((v) => (v.key === vKey ? { ...v, ...mudanca } : v)) }
          : l,
      ),
    );
  }

  function removerVariacao(key: string, vKey: string) {
    setLinhas((ls) =>
      ls.map((l) => (l.key === key ? { ...l, variacoes: l.variacoes.filter((v) => v.key !== vKey) } : l)),
    );
  }

  const marcadas = linhas.filter((l) => l.incluir);
  const jaExistem = linhas.filter((l) => l.ean && porEan.has(l.ean)).length;
  const totalProdutos = marcadas.reduce((s, l) => s + Math.max(1, l.variacoes.length), 0);
  // já cadastrado (achado pelo código) e sem variação vira atualização do
  // que já existe, não um produto novo — a nota pode ter dos dois tipos
  // ao mesmo tempo quando é um reprocessamento parcial.
  const totalAtualizar = marcadas.filter((l) => l.ean && porEan.has(l.ean) && l.variacoes.length === 0).length;
  const totalNovos = totalProdutos - totalAtualizar;
  const totalEtiquetas = marcadas.reduce(
    (s, l) => s + l.etiquetas * Math.max(1, l.variacoes.length),
    0,
  );

  /** Só deixa gravar quando o essencial está preenchido. */
  const pendencias = useMemo(() => {
    const p: string[] = [];
    for (const l of marcadas) {
      if (!l.nome.trim()) p.push(`Item ${l.item.numero}: falta o nome`);
      if (l.variacoes.length === 0) {
        if (!l.ean.trim()) p.push(`Item ${l.item.numero}: falta o código de barras`);
        else if (!isValidEan13(l.ean.trim()) && l.ean.trim().length === 13) {
          p.push(`Item ${l.item.numero}: código ${l.ean} tem dígito verificador errado`);
        }
      } else {
        for (const v of l.variacoes) {
          if (!v.nome.trim()) p.push(`Item ${l.item.numero}: variação sem nome`);
        }
      }
    }
    return p;
  }, [marcadas]);

  async function importar() {
    setSalvando(true);
    setErro(null);
    try {
      const novos: Record<string, unknown>[] = [];
      const atualizacoes: { id: string; fields: Record<string, unknown> }[] = [];
      for (const l of marcadas) {
        const existente = l.ean ? porEan.get(l.ean) : undefined;
        const base = {
          brand: l.marca.trim() || null,
          category_id: l.categoriaId || null,
          photo_source_url: l.photoUrl.trim() || null,
          // produto só fica ativo com foto; sem foto (nova ou reprocessada)
          // fica desativado e aparece em "A completar", conforme a regra do catálogo
          status: l.photoUrl.trim() ? 'ativo' : 'desativado',
          status_manual: true,
        };
        // já existe pelo código de barras: é reprocessamento — atualiza o
        // cadastro que já tem (a foto que faltava, e o que foi corrigido
        // na tela) em vez de tentar duplicar, o que ia esbarrar no código
        // de barras repetido.
        if (existente && l.variacoes.length === 0) {
          atualizacoes.push({
            id: existente.id,
            fields: {
              ...base,
              name: l.nome.trim(),
              notes: `Reprocessado pela NF ${nota?.numero ?? ''} — ${l.item.codigoFornecedor}`,
            },
          });
          continue;
        }
        const baseNovo = {
          ...base,
          supplier: l.fornecedor.trim() || null,
          source: 'manual',
          notes: `Entrada pela NF ${nota?.numero ?? ''} — ${l.item.codigoFornecedor}`,
        };
        if (l.variacoes.length > 0) {
          for (const v of l.variacoes) {
            novos.push({ ...baseNovo, name: `${l.nome.trim()} - ${v.nome.trim()}`, barcode: v.ean });
          }
        } else {
          novos.push({ ...baseNovo, name: l.nome.trim(), barcode: l.ean.trim() || null });
        }
      }

      let gravados = 0;
      for (let i = 0; i < novos.length; i += 50) {
        const { error } = await supabase.from('products').insert(novos.slice(i, i + 50));
        if (error) throw error;
        gravados += Math.min(50, novos.length - i);
      }
      let atualizados = 0;
      for (const a of atualizacoes) {
        const { error } = await supabase.from('products').update(a.fields).eq('id', a.id);
        if (error) throw error;
        atualizados++;
      }
      const partes: string[] = [];
      if (gravados > 0) partes.push(`${gravados} produto${gravados === 1 ? '' : 's'} cadastrado${gravados === 1 ? '' : 's'}`);
      if (atualizados > 0) partes.push(`${atualizados} produto${atualizados === 1 ? '' : 's'} atualizado${atualizados === 1 ? '' : 's'}`);
      setResultado(partes.length > 0 ? `${partes.join(' · ')}.` : 'Nada para gravar.');
      setNota(null);
      setLinhas([]);
      localStorage.removeItem(RASCUNHO);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  /**
   * Manda para a tela de etiquetas o que está marcado e tem código. Cada
   * variação leva a mesma quantidade da linha, já que cada uma é um produto
   * com código próprio na prateleira.
   */
  function irParaEtiquetas() {
    const fila: ItemEtiqueta[] = [];
    for (const l of marcadas) {
      if (l.etiquetas <= 0) continue;
      if (l.variacoes.length > 0) {
        for (const v of l.variacoes) {
          if (v.ean) fila.push({ nome: `${l.nome} - ${v.nome}`.trim(), barcode: v.ean, copias: l.etiquetas });
        }
      } else if (l.ean.trim()) {
        fila.push({ nome: l.nome, barcode: l.ean.trim(), copias: l.etiquetas });
      }
    }
    if (fila.length === 0) return;
    enviarParaEtiquetas(fila);
    window.location.hash = '#/etiquetas';
  }

  function descartar() {
    if (!confirm('Descartar esta nota e tudo que foi preenchido?')) return;
    setNota(null);
    setLinhas([]);
    localStorage.removeItem(RASCUNHO);
  }

  return (
    <main className="content">
      <div className="page-head">
        <a href="#/" className="back">‹ Início</a>
        <h1>Entrada de nota</h1>
      </div>

      {!nota && (
        <>
          <p className="muted review-hint">
            A nota já traz descrição, código de barras, fornecedor e quantas
            unidades vêm na caixa — aqui você completa categoria e foto,
            escolhe o que entra, e só então o produto vai para o catálogo.
          </p>

          <section className="nf-chave">
            <h2 className="nf-sub">Tenho a nota em papel</h2>
            <p className="muted small">
              Digite os 44 dígitos do rodapé do DANFE. Conferimos a chave aqui
              antes de você gastar tempo no site de consulta — chave digitada
              errada é o motivo mais comum de "nota não encontrada".
            </p>
            <input
              className="nf-chave-input mono"
              value={formataChave(chave)}
              onChange={(e) => { setChave(e.target.value); setChaveCopiada(false); }}
              placeholder="0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000"
              inputMode="numeric"
            />
            {chave.replace(/\D/g, '').length > 0 && (
              dadosChave ? (
                <div className="nf-chave-ok">
                  <strong>✓ Chave válida</strong>
                  <span className="small">
                    NF {dadosChave.numero} · série {dadosChave.serie} · {dadosChave.uf} ·{' '}
                    {dadosChave.emissao} · emitente {formataCnpj(dadosChave.cnpjEmitente)}
                  </span>
                  <div className="nf-chave-acoes">
                    <button
                      className="secondary"
                      onClick={async () => {
                        await navigator.clipboard.writeText(dadosChave.chave);
                        setChaveCopiada(true);
                      }}
                    >
                      {chaveCopiada ? 'Copiada!' : 'Copiar chave'}
                    </button>
                    <a
                      className="nf-link-externo"
                      href="https://meudanfe.com.br"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Abrir Meu Danfe ↗
                    </a>
                  </div>
                </div>
              ) : (
                <p className="error small">
                  {chave.replace(/\D/g, '').length !== 44
                    ? `${chave.replace(/\D/g, '').length} de 44 dígitos.`
                    : 'Os 44 dígitos estão completos, mas o verificador não bate — confira a digitação.'}
                </p>
              )
            )}
          </section>

          <section className="nf-entrada">
            <h2 className="nf-sub">Já tenho o XML</h2>
            <label className="nf-drop">
              <input
                type="file"
                accept=".xml,text/xml,application/xml"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void carregarArquivo(f); }}
              />
              <span>📄 Escolher o arquivo XML</span>
            </label>
            <details className="nf-colar">
              <summary>ou colar o conteúdo do XML</summary>
              <textarea
                value={xmlColado}
                onChange={(e) => setXmlColado(e.target.value)}
                placeholder="Cole aqui o XML copiado do site de consulta…"
                rows={6}
              />
              <button
                className="primary"
                onClick={() => carregarXml(xmlColado)}
                disabled={!xmlColado.trim()}
              >
                Ler nota colada
              </button>
            </details>
          </section>

          {resultado && <p className="nf-ok">✅ {resultado}</p>}
        </>
      )}

      {erro && <p className="error">{erro}</p>}

      {nota && (
        <>
          <div className="nf-cabecalho">
            <div>
              <strong>{nota.fornecedor || 'Fornecedor não identificado'}</strong>
              <span className="muted small">
                NF {nota.numero} · {nota.emissao} · {nota.itens.length} itens
                {jaExistem > 0 && ` · ${jaExistem} já no catálogo`}
              </span>
            </div>
            <button className="link-muted" onClick={descartar}>Descartar nota</button>
          </div>

          {jaExistem > 0 && (
            <div className="notice">
              {jaExistem} item{jaExistem === 1 ? ' já está' : 'ns já estão'} cadastrado
              {jaExistem === 1 ? '' : 's'} — quem ainda está sem foto veio <strong>marcado</strong>{' '}
              para reprocessar (busca a foto e ativa, sem duplicar o cadastro). Nome, marca e
              categoria vieram do cadastro atual, não da nota — o que você já corrigiu à mão
              continua valendo, e dá pra ajustar de novo se precisar.
            </div>
          )}

          <div className="nf-acoes-topo">
            <button className="secondary" onClick={() => setLinhas((ls) => ls.map((l) => ({ ...l, incluir: true })))}>
              Marcar todos
            </button>
            <button className="secondary" onClick={() => setLinhas((ls) => ls.map((l) => ({ ...l, incluir: false })))}>
              Desmarcar todos
            </button>
            <button
              className="secondary"
              onClick={() => setLinhas((ls) => ls.map((l) => ({ ...l, incluir: !(l.ean && porEan.has(l.ean)) })))}
            >
              Só os novos
            </button>
            <span className="nf-sep" />
            <button
              className="secondary"
              onClick={() =>
                setLinhas((ls) =>
                  ls.map((l) => ({
                    ...l,
                    etiquetas: Math.max(0, Math.round(l.item.quantidadeComercial * l.fator)),
                  })),
                )
              }
              title="Uma etiqueta por unidade recebida"
            >
              Etiquetas = quantidade da nota
            </button>
            <button className="secondary" onClick={() => setLinhas((ls) => ls.map((l) => ({ ...l, etiquetas: 1 })))}>
              1 etiqueta cada
            </button>
            <button className="secondary" onClick={() => setLinhas((ls) => ls.map((l) => ({ ...l, etiquetas: 0 })))}>
              Zerar etiquetas
            </button>
            <span className="nf-sep" />
            <button
              className="secondary"
              onClick={buscarFotosPendentes}
              disabled={buscaFotos?.ativo}
              title="Procura de novo a foto de quem ainda não tem, pelas mesmas lojas de sempre"
            >
              🔎 Buscar fotos
            </button>
          </div>

          {buscaFotos && (
            <p className="tiny muted nf-busca-fotos">
              {buscaFotos.ativo
                ? `🔎 Buscando foto na internet… ${buscaFotos.feito}/${buscaFotos.total} (${buscaFotos.achadas} encontrada${buscaFotos.achadas === 1 ? '' : 's'} até agora)`
                : `🔎 Busca de fotos concluída: ${buscaFotos.achadas} de ${buscaFotos.total} encontrada${buscaFotos.achadas === 1 ? '' : 's'} automaticamente.`}
            </p>
          )}

          <ul className="nf-itens">
            {linhas.map((l) => {
              const existente = l.ean ? porEan.get(l.ean) : undefined;
              const unidades = l.item.quantidadeComercial * l.fator;
              return (
                <li key={l.key} className={`nf-item ${l.incluir ? 'on' : ''}`}>
                  <div className="nf-item-topo">
                    <input
                      type="checkbox"
                      checked={l.incluir}
                      onChange={(e) => editar(l.key, { incluir: e.target.checked })}
                      aria-label="Incluir no catálogo"
                    />
                    <div className="nf-item-id">
                      <span className="nf-item-desc">{l.item.descricao}</span>
                      <span className="mono tiny muted">
                        item {l.item.numero} · {l.item.ean ?? 'sem GTIN na nota'} ·{' '}
                        {l.item.quantidadeComercial} {l.item.unidadeComercial}
                        {l.fator !== 1 && ` → ${unidades} un`}
                      </span>
                    </div>
                    {!existente && !l.ean.trim() && l.variacoes.length === 0 && (
                      <div className="nf-ean-rapido">
                        <input
                          className="mono"
                          placeholder="Código de barras"
                          value={l.ean}
                          onChange={(e) => onEanChange(l.key, e.target.value)}
                          inputMode="numeric"
                          aria-label={`Código de barras de ${l.item.descricao}`}
                        />
                        <button
                          type="button"
                          onClick={() => onEanChange(l.key, gerarEan())}
                          title="Gerar código interno"
                        >
                          ⊕
                        </button>
                      </div>
                    )}
                    {l.photoUrl.trim() && (
                      <span className="badge nf-badge-foto" title="Foto encontrada">📷</span>
                    )}
                    {existente ? (
                      <span className="badge nf-badge-existe" title="Já cadastrado — marcado, vai atualizar em vez de duplicar">
                        {l.incluir && l.variacoes.length === 0 ? 'atualizar' : 'já no catálogo'}
                      </span>
                    ) : (
                      <span className="badge nf-badge-novo">novo</span>
                    )}
                    <label className="nf-etq" title="Quantas etiquetas imprimir deste produto">
                      🖨️
                      <input
                        type="number"
                        min={0}
                        value={l.etiquetas}
                        onChange={(e) => editar(l.key, { etiquetas: Math.max(0, Number(e.target.value)) })}
                      />
                    </label>
                    <button className="nf-expand" onClick={() => editar(l.key, { aberto: !l.aberto })}>
                      {l.aberto ? '▾' : '▸'}
                    </button>
                  </div>

                  {existente && (
                    <p className="nf-existente muted small">
                      Já cadastrado como <a href={`#/p/${existente.id}`}>{existente.name}</a>
                      {existente.category_id && ` em ${catPorId.get(existente.category_id)}`}.
                    </p>
                  )}

                  {l.aberto && (
                    <div className="nf-form">
                      <label>
                        Nome no catálogo
                        <input value={l.nome} onChange={(e) => editar(l.key, { nome: e.target.value })} />
                      </label>

                      <div className="nf-linha">
                        <label>
                          Código de barras
                          <input
                            value={l.ean}
                            onChange={(e) => onEanChange(l.key, e.target.value)}
                            inputMode="numeric"
                            disabled={l.variacoes.length > 0 || Boolean(existente)}
                            title={existente ? 'Já cadastrado com este código — é ele que faz a linha achar o produto certo' : undefined}
                          />
                        </label>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => onEanChange(l.key, gerarEan())}
                          disabled={l.variacoes.length > 0 || Boolean(existente)}
                        >
                          ⊕ Gerar interno
                        </button>
                      </div>
                      {isValidEan13(l.ean.trim()) && (
                        <div
                          className="ean-preview"
                          dangerouslySetInnerHTML={{ __html: eanSvg(l.ean.trim(), { modulo: 2, altura: 40 }) }}
                        />
                      )}
                      {l.ean.trim().length === 12 && (
                        <button
                          type="button"
                          className="link-muted"
                          onClick={() => onEanChange(l.key, completeEan13(l.ean.trim()))}
                        >
                          Completar com o dígito verificador → {completeEan13(l.ean.trim())}
                        </button>
                      )}

                      <div className="nf-linha">
                        <label>
                          Marca
                          <input value={l.marca} onChange={(e) => editar(l.key, { marca: e.target.value })} />
                        </label>
                        <label>
                          Fornecedor
                          <input value={l.fornecedor} onChange={(e) => editar(l.key, { fornecedor: e.target.value })} />
                        </label>
                      </div>

                      <label>
                        Categoria
                        <select value={l.categoriaId} onChange={(e) => editar(l.key, { categoriaId: e.target.value })}>
                          <option value="">— sem categoria —</option>
                          {[...categories]
                            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
                            .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </label>

                      <label>
                        Link da foto
                        <input
                          value={l.photoUrl}
                          onChange={(e) => editar(l.key, { photoUrl: e.target.value })}
                          placeholder="https://… (sem foto, o produto entra desativado)"
                        />
                      </label>
                      {l.photoUrl.trim() && (
                        <img
                          src={l.photoUrl.trim()}
                          alt=""
                          className="nf-foto-preview"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      )}

                      <div className="nf-conversao">
                        <span className="muted small">
                          Conversão: {l.item.quantidadeComercial} {l.item.unidadeComercial} ={' '}
                          <strong>{unidades}</strong> unidades
                        </span>
                        <label>
                          Unidades por {l.item.unidadeComercial || 'embalagem'}
                          <input
                            type="number"
                            min={1}
                            step="0.001"
                            value={l.fator}
                            onChange={(e) => editar(l.key, { fator: Number(e.target.value) || 1 })}
                          />
                        </label>
                        {l.item.fatorConversao !== 1 && (
                          <span className="tiny muted">
                            (a nota declarou {l.item.quantidadeTributavel} {l.item.unidadeTributavel})
                          </span>
                        )}
                      </div>

                      <div className="nf-variacoes">
                        <div className="nf-var-topo">
                          <strong className="small">Variações</strong>
                          <button type="button" className="secondary" onClick={() => addVariacao(l.key)}>
                            + Adicionar variação
                          </button>
                        </div>
                        {l.variacoes.length === 0 ? (
                          <p className="tiny muted">
                            Use quando o fornecedor manda cores ou tamanhos diferentes com um
                            código só. Cada variação vira um produto com código interno próprio.
                          </p>
                        ) : (
                          <ul className="nf-var-lista">
                            {l.variacoes.map((v) => (
                              <li key={v.key}>
                                <input
                                  placeholder="Cor, tamanho, sabor…"
                                  value={v.nome}
                                  onChange={(e) => editarVariacao(l.key, v.key, { nome: e.target.value })}
                                />
                                <input
                                  className="mono"
                                  value={v.ean}
                                  onChange={(e) => editarVariacao(l.key, v.key, { ean: e.target.value })}
                                />
                                <button className="cart-del" onClick={() => removerVariacao(l.key, v.key)} aria-label="Remover">✕</button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {pendencias.length > 0 && marcadas.length > 0 && (
            <div className="nf-pendencias">
              <strong className="small">Falta preencher:</strong>
              <ul>{pendencias.slice(0, 8).map((p) => <li key={p}>{p}</li>)}</ul>
              {pendencias.length > 8 && <span className="tiny muted">… e mais {pendencias.length - 8}</span>}
            </div>
          )}

          <div className="selbar selbar-cat">
            <span>
              {marcadas.length} item{marcadas.length === 1 ? '' : 's'} → {totalNovos} novo{totalNovos === 1 ? '' : 's'}
              {totalAtualizar > 0 && ` · ${totalAtualizar} atualizado${totalAtualizar === 1 ? '' : 's'}`}
              {totalEtiquetas > 0 && ` · ${totalEtiquetas} etiqueta${totalEtiquetas === 1 ? '' : 's'}`}
              {buscaFotos?.ativo && ' · aguardando a busca de fotos terminar…'}
            </span>
            <button
              className="selbar-save"
              onClick={importar}
              disabled={salvando || marcadas.length === 0 || pendencias.length > 0 || Boolean(buscaFotos?.ativo)}
              title={buscaFotos?.ativo ? 'Espere a busca de fotos terminar — senão quem ainda não foi buscado entra sem foto' : undefined}
            >
              {salvando ? 'Gravando…' : 'Cadastrar no catálogo'}
            </button>
            <button className="selbar-save" onClick={irParaEtiquetas} disabled={totalEtiquetas === 0}>
              🖨️ Etiquetas ({totalEtiquetas})
            </button>
          </div>
        </>
      )}
    </main>
  );
}
