import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { criarBusca } from '../lib/busca';
import { useCatalog } from '../lib/catalog';
import { photoSrc, useSignedUrls } from '../lib/photos';
import { storeLabel, type StoreId } from '../lib/store';
import {
  DIAS_ALERTA, apagarValidade, formataValidade, listarValidades, registrarValidade, situacao,
  validadesCsv, type NovaValidade, type Situacao, type Validade,
} from '../lib/validades';

// câmera + leitor de código + OCR são pesados — só baixam ao abrir
const LeitorValidade = lazy(() =>
  import('../components/LeitorValidade').then((m) => ({ default: m.LeitorValidade })),
);

interface Props {
  store: StoreId;
  email: string | null;
}

type Filtro = 'todos' | 'vencido' | 'alerta';

export function Validades({ store, email }: Props) {
  const { products } = useCatalog();
  const [itens, setItens] = useState<Validade[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [q, setQ] = useState('');

  async function recarregar() {
    try {
      setItens(await listarValidades(store));
      setErro(null);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErro(/validades/.test(m) ? 'Falta rodar a migration de lotes e validades no Supabase.' : m);
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { void recarregar(); /* eslint-disable-next-line */ }, [store]);

  const contagem = useMemo(() => {
    const c: Record<Situacao, number> = { vencido: 0, alerta: 0, ok: 0, sem: 0 };
    for (const v of itens) c[situacao(v).tipo]++;
    return c;
  }, [itens]);

  const visiveis = useMemo(() => {
    const casa = criarBusca(q);
    return itens.filter(
      (v) =>
        (filtro === 'todos' || situacao(v).tipo === filtro) &&
        (!casa || casa(`${v.product_name} ${v.barcode ?? ''} ${v.lote ?? ''}`)),
    );
  }, [itens, filtro, q]);

  // a foto vem do catálogo, cruzando pelo id — o registro só guarda o nome
  const porId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const comFoto = useMemo(
    () =>
      visiveis
        .map((v) => (v.product_id ? porId.get(v.product_id) : undefined))
        .filter((p): p is (typeof products)[number] => Boolean(p)),
    [visiveis, porId],
  );
  const assinadas = useSignedUrls(comFoto);
  const fotoDe = (v: Validade) => {
    const p = v.product_id ? porId.get(v.product_id) : undefined;
    return p ? photoSrc(p, assinadas) : null;
  };

  async function salvar(nova: NovaValidade): Promise<boolean> {
    const repetido = itens.some(
      (v) => v.barcode === nova.barcode && (v.lote ?? null) === nova.lote && v.validade === nova.validade,
    );
    if (repetido && !confirm('Este produto com este lote e validade já foi registrado. Registrar de novo?')) {
      return false;
    }
    const salvo = await registrarValidade(store, nova, email);
    setItens((cur) =>
      [...cur, salvo].sort((a, b) => (a.validade ?? '9999').localeCompare(b.validade ?? '9999')),
    );
    setOk(`${salvo.product_name} · lote ${salvo.lote ?? '—'} · ${formataValidade(salvo)}`);
    setTimeout(() => setOk(null), 4000);
    return true;
  }

  async function apagar(v: Validade) {
    if (!confirm(`Apagar o registro de ${v.product_name} (lote ${v.lote ?? '—'}, ${formataValidade(v)})?`)) return;
    try {
      await apagarValidade(v.id);
      setItens((cur) => cur.filter((x) => x.id !== v.id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function exportar() {
    const nome = `validades-${store}-${new Date().toISOString().slice(0, 10)}.csv`;
    const arquivo = new File([validadesCsv(visiveis)], nome, { type: 'text/csv' });
    if (navigator.canShare?.({ files: [arquivo] })) {
      try {
        await navigator.share({ files: [arquivo], title: `Validades — ${storeLabel(store)}` });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(arquivo);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  const FILTROS: { id: Filtro; rotulo: string }[] = [
    { id: 'todos', rotulo: `Todos (${itens.length})` },
    { id: 'vencido', rotulo: `Vencidos (${contagem.vencido})` },
    { id: 'alerta', rotulo: `Vencem em ${DIAS_ALERTA} dias (${contagem.alerta})` },
  ];

  return (
    <main className="content">
      <div className="page-head">
        <a href="#/" className="back">‹ Início</a>
        <h1>📅 Lotes e validades — {storeLabel(store)}</h1>
      </div>
      <p className="muted small">
        Bipe o produto e mire a câmera no lote e na validade da embalagem: o app
        transcreve os dados. Nenhuma foto é guardada.
      </p>

      {erro && <p className="error">{erro}</p>}

      <button className="primary val-bipar" onClick={() => setLendo(true)}>
        📷 Bipar produto
      </button>
      {ok && <p className="nf-ok">Registrado: {ok}</p>}

      {lendo && (
        <Suspense fallback={<div className="lv-overlay"><p className="lv-dica">Abrindo câmera…</p></div>}>
          <LeitorValidade onFechar={() => setLendo(false)} onSalvar={salvar} />
        </Suspense>
      )}

      {itens.length > 0 && (
        <>
          <div className="val-resumo">
            <div className="val-vencido"><strong>{contagem.vencido}</strong><span>vencidos</span></div>
            <div className="val-alerta"><strong>{contagem.alerta}</strong><span>vencem em {DIAS_ALERTA} dias</span></div>
            <div className="val-ok"><strong>{contagem.ok}</strong><span>no prazo</span></div>
          </div>

          <div className="val-filtros">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                className={`chip ${filtro === f.id ? 'active' : ''}`}
                onClick={() => setFiltro(f.id)}
                aria-pressed={filtro === f.id}
              >
                {f.rotulo}
              </button>
            ))}
          </div>

          <div className="val-busca">
            <input
              type="search"
              placeholder="Buscar por produto, código ou lote"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button className="secondary" onClick={exportar} disabled={!visiveis.length}>
              ⬇️ Planilha
            </button>
          </div>
        </>
      )}

      {carregando && <p className="muted center-msg">Carregando…</p>}
      {!carregando && itens.length === 0 && !erro && (
        <p className="muted center-msg">Nada registrado ainda. Toque em <strong>Bipar produto</strong>.</p>
      )}

      <ul className="val-lista">
        {visiveis.map((v) => {
          const s = situacao(v);
          const foto = fotoDe(v);
          return (
            <li key={v.id} className={`val-item val-${s.tipo}`}>
              <span className="ret-mini">
                <span aria-hidden>🐾</span>
                {foto && (
                  <img src={foto} alt="" loading="lazy"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                )}
              </span>
              <span className="val-texto">
                <span className="val-nome">{v.product_name}</span>
                <span className="tiny muted">
                  Lote <b className="mono">{v.lote ?? '—'}</b>
                  {v.barcode ? ` · ${v.barcode}` : ''}
                </span>
                {v.created_by && <span className="tiny muted">{v.created_by}</span>}
              </span>
              <span className="val-data">
                <strong>{formataValidade(v)}</strong>
                <span className="tiny">{s.rotulo}</span>
              </span>
              <button className="cart-del" onClick={() => apagar(v)} aria-label="Apagar registro">✕</button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
