import { useCallback, useEffect, useMemo, useState } from 'react';
import { criarBusca } from '../lib/busca';
import { supabase } from '../lib/supabase';
import {
  type CandidatoTiny, type Categoria, type EstadoVarredura, type FalhaPuxar, type ResumoVarredura,
  codigoDoCandidato, comandarVarredura, lerVarredura, listarCandidatos, puxarCandidatos,
} from '../lib/tiny';
import { CopiarCodigo } from './CopiarCodigo';

/** Mesmo valor da função: sem notícia há mais que isso, a varredura travou. */
const TRAVADA_APOS_MS = 4 * 60_000;
/** Ritmo da função (~1,2 s por consulta), para estimar quanto falta. */
const SEGUNDOS_POR_CONSULTA = 1.2;
const PAGINA_LISTA = 100;

type Filtro = 'todos' | 'ativos' | 'inativos' | 'sku' | 'avisos';

const mensagemErro = (e: unknown) => {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  return /tiny_varredura|tiny_resumo|tiny_candidatos/.test(m)
    ? 'Falta rodar o SQL da varredura do Tiny no Supabase.'
    : m;
};

const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR') : '');

export function VarreduraTiny() {
  const [estado, setEstado] = useState<EstadoVarredura | null>(null);
  const [resumo, setResumo] = useState<ResumoVarredura | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [comandando, setComandando] = useState(false);

  const [cands, setCands] = useState<CandidatoTiny[] | null>(null);
  const [carregandoPrevia, setCarregandoPrevia] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [q, setQ] = useState('');
  const [limite, setLimite] = useState(PAGINA_LISTA);

  const [puxando, setPuxando] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [falhas, setFalhas] = useState<FalhaPuxar[]>([]);

  const atualizar = useCallback(async () => {
    try {
      const r = await lerVarredura();
      setEstado(r.estado);
      setResumo(r.resumo);
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }, []);

  useEffect(() => { void atualizar(); }, [atualizar]);

  const rodando = estado?.estado === 'listando' || estado?.estado === 'detalhando';
  const travada = rodando && estado?.atualizada_em
    ? Date.now() - new Date(estado.atualizada_em).getTime() > TRAVADA_APOS_MS
    : false;

  // acompanha enquanto roda; parada, não gasta consulta
  useEffect(() => {
    if (!rodando) return;
    const t = setInterval(() => void atualizar(), 5000);
    return () => clearInterval(t);
  }, [rodando, atualizar]);

  async function comandar(acao: 'iniciar' | 'parar' | 'retomar') {
    if (acao === 'iniciar' && !confirm(
      'Iniciar a varredura de todos os cadastros do Tiny? A primeira pode levar algumas horas — ' +
      'roda no Supabase, dá para fechar esta tela.',
    )) return;
    setComandando(true);
    try {
      await comandarVarredura(acao);
      await atualizar();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setComandando(false);
    }
  }

  // ---- prévia --------------------------------------------------------------

  /** Mesmo código em dois cadastros do Tiny: só um pode entrar no catálogo. */
  const duplicados = useMemo(() => {
    const porCodigo = new Map<string, CandidatoTiny[]>();
    for (const c of cands ?? []) {
      const { barcode, sku } = codigoDoCandidato(c);
      const chave = barcode ?? `sku:${sku}`;
      porCodigo.set(chave, [...(porCodigo.get(chave) ?? []), c]);
    }
    const dup = new Set<string>();
    for (const grupo of porCodigo.values()) {
      if (grupo.length < 2) continue;
      // fica de pé o ativo no Tiny; os outros vão marcados como repetidos
      const [, ...resto] = [...grupo].sort((a, b) => Number(b.situacao === 'A') - Number(a.situacao === 'A'));
      for (const c of resto) dup.add(c.tiny_id);
    }
    return dup;
  }, [cands]);

  async function montarPrevia(limparAviso = true) {
    setCarregandoPrevia(true);
    if (limparAviso) {
      setResultado(null);
      setFalhas([]);
    }
    try {
      const lista = await listarCandidatos();
      setCands(lista);
      setLimite(PAGINA_LISTA);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setCarregandoPrevia(false);
    }
  }

  // seleção inicial: ativo no Tiny, sem nome igual no catálogo, sem código repetido
  useEffect(() => {
    if (!cands) return;
    setMarcados(new Set(
      cands
        .filter((c) => c.situacao === 'A' && !c.nome_parecido && !duplicados.has(c.tiny_id))
        .map((c) => c.tiny_id),
    ));
  }, [cands, duplicados]);

  const filtrados = useMemo(() => {
    const casa = criarBusca(q);
    return (cands ?? []).filter((c) => {
      if (filtro === 'ativos' && c.situacao !== 'A') return false;
      if (filtro === 'inativos' && c.situacao === 'A') return false;
      if (filtro === 'sku' && codigoDoCandidato(c).barcode) return false;
      if (filtro === 'avisos' && !c.nome_parecido && !duplicados.has(c.tiny_id)) return false;
      return !casa || casa(`${c.nome} ${c.marca ?? ''} ${c.gtin ?? ''} ${c.codigo ?? ''}`);
    });
  }, [cands, filtro, q, duplicados]);

  function alternar(id: string) {
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function marcarFiltrados(marcar: boolean) {
    setMarcados((m) => {
      const n = new Set(m);
      for (const c of filtrados) {
        if (marcar) n.add(c.tiny_id);
        else n.delete(c.tiny_id);
      }
      return n;
    });
  }

  async function puxar() {
    const escolhidos = (cands ?? []).filter((c) => marcados.has(c.tiny_id));
    if (!escolhidos.length) return;
    if (!confirm(`Puxar ${escolhidos.length} produto(s) do Tiny para o catálogo? Entram ativos, com a foto do Tiny.`)) return;
    setPuxando('Preparando…');
    setResultado(null);
    setFalhas([]);
    try {
      const { data: cats, error } = await supabase.from('categories').select('id, name');
      if (error) throw error;
      const f = await puxarCandidatos(escolhidos, (cats ?? []) as Categoria[], (feitos) =>
        setPuxando(`Gravando no catálogo… ${feitos} de ${escolhidos.length}`),
      );
      setFalhas(f);
      setResultado(`${escolhidos.length - f.length} produto(s) entraram no catálogo.`);
      await Promise.all([montarPrevia(false), atualizar()]);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setPuxando(null);
    }
  }

  // ---- tela ----------------------------------------------------------------

  const faltaMin = estado?.estado === 'detalhando' && estado.a_detalhar != null
    ? Math.ceil(((estado.a_detalhar - estado.detalhados) * SEGUNDOS_POR_CONSULTA) / 60)
    : null;

  const FILTROS: { id: Filtro; rotulo: string }[] = [
    { id: 'todos', rotulo: 'Todos' },
    { id: 'ativos', rotulo: 'Ativos no Tiny' },
    { id: 'inativos', rotulo: 'Inativos no Tiny' },
    { id: 'sku', rotulo: 'Só com SKU' },
    { id: 'avisos', rotulo: 'Com aviso' },
  ];

  return (
    <section className="varr">
      <p className="muted review-hint">
        Confere <strong>todos</strong> os cadastros do Tiny com o catálogo e monta uma prévia do
        que falta. Só aparecem cadastros <strong>completos</strong>: com foto e com código (EAN ou
        SKU). Sem foto, ou sem EAN e sem SKU, nunca entram. Nada é gravado antes de você escolher
        na prévia e confirmar.
      </p>

      {erro && <p className="error">{erro}</p>}

      {estado && (
        <div className={`varr-estado varr-${travada ? 'erro' : estado.estado}`}>
          <strong>
            {estado.estado === 'parada' && (estado.iniciada_em ? 'Varredura parada' : 'Nenhuma varredura feita ainda')}
            {estado.estado === 'listando' && 'Listando os cadastros do Tiny'}
            {estado.estado === 'detalhando' && 'Consultando foto e marca'}
            {estado.estado === 'pronta' && `Varredura concluída em ${quando(estado.concluida_em)}`}
            {estado.estado === 'erro' && 'A varredura parou com erro'}
          </strong>
          {estado.mensagem && <span className="small">{estado.mensagem}</span>}
          {estado.estado === 'listando' && estado.paginas ? (
            <progress max={estado.paginas} value={estado.pagina} />
          ) : null}
          {estado.estado === 'detalhando' && estado.a_detalhar ? (
            <>
              <progress max={estado.a_detalhar} value={estado.detalhados} />
              {faltaMin != null && (
                <span className="tiny muted">
                  Faltam cerca de {faltaMin >= 90 ? `${Math.round(faltaMin / 60)} h` : `${faltaMin} min`}. Pode
                  fechar esta tela — a varredura continua no Supabase.
                </span>
              )}
            </>
          ) : null}
          {travada && (
            <span className="small error">
              Sem notícia desde {quando(estado.atualizada_em)} — parece ter travado. Toque em Retomar.
            </span>
          )}
          <div className="varr-botoes">
            {!rodando && (
              <button className="primary" onClick={() => comandar('iniciar')} disabled={comandando}>
                {estado.iniciada_em ? '🔄 Nova varredura' : '🔎 Iniciar varredura'}
              </button>
            )}
            {(estado.estado === 'erro' || travada) && (
              <button className="secondary" onClick={() => comandar('retomar')} disabled={comandando}>
                ▶️ Retomar de onde parou
              </button>
            )}
            {rodando && (
              <button className="secondary" onClick={() => comandar('parar')} disabled={comandando}>
                ⏹ Parar
              </button>
            )}
          </div>
        </div>
      )}

      {resumo && resumo.total > 0 && (
        <div className="varr-resumo">
          <div><strong>{resumo.total}</strong><span>no Tiny</span></div>
          <div><strong>{resumo.no_catalogo}</strong><span>já no catálogo</span></div>
          <div><strong>{resumo.kits + resumo.pais + resumo.sem_codigo}</strong><span>fora (kit, pai de variação ou sem código)</span></div>
          <div><strong>{resumo.sem_foto}</strong><span>sem foto (não entram)</span></div>
          <div className="varr-destaque"><strong>{resumo.completos}</strong><span>completos para a prévia</span></div>
        </div>
      )}

      {resumo && resumo.completos > 0 && (
        <button className="secondary" onClick={() => montarPrevia()} disabled={carregandoPrevia || Boolean(puxando)}>
          {carregandoPrevia ? 'Montando a prévia…' : cands ? '↻ Atualizar a prévia' : `👀 Ver a prévia (${resumo.completos})`}
        </button>
      )}
      {rodando && cands && (
        <p className="tiny muted">A varredura ainda está andando: a prévia mostra o que já foi conferido até agora.</p>
      )}

      {resultado && <p className="nf-ok">{resultado}</p>}
      {falhas.length > 0 && (
        <details className="varr-falhas" open>
          <summary className="error">{falhas.length} não entraram</summary>
          <ul>{falhas.map((f) => <li key={f.tiny_id} className="small">{f.nome} — {f.erro}</li>)}</ul>
        </details>
      )}

      {cands && (
        <>
          <div className="val-filtros">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                className={`chip ${filtro === f.id ? 'active' : ''}`}
                onClick={() => { setFiltro(f.id); setLimite(PAGINA_LISTA); }}
                aria-pressed={filtro === f.id}
              >
                {f.rotulo}
              </button>
            ))}
          </div>
          <input
            type="search"
            className="varr-busca"
            placeholder="Buscar por nome, marca, EAN ou SKU"
            value={q}
            onChange={(e) => { setQ(e.target.value); setLimite(PAGINA_LISTA); }}
          />
          <div className="varr-barra">
            <span className="small">
              <strong>{marcados.size}</strong> selecionado(s) de {cands.length} · mostrando {filtrados.length}
            </span>
            <button className="link-muted" onClick={() => marcarFiltrados(true)}>Marcar os mostrados</button>
            <button className="link-muted" onClick={() => marcarFiltrados(false)}>Desmarcar os mostrados</button>
          </div>
          <p className="tiny muted">
            Vêm desmarcados: inativos no Tiny, quem tem o mesmo nome de um produto do catálogo e
            código repetido em outro cadastro do Tiny. Confira e marque se quiser puxar.
          </p>

          <ul className="varr-lista">
            {filtrados.slice(0, limite).map((c) => {
              const { barcode, sku } = codigoDoCandidato(c);
              const on = marcados.has(c.tiny_id);
              return (
                <li key={c.tiny_id} className={`varr-item ${on ? 'on' : ''}`}>
                  <label>
                    <input type="checkbox" checked={on} onChange={() => alternar(c.tiny_id)} />
                    <img src={c.fotos[0]} alt="" loading="lazy" />
                    <span className="varr-texto">
                      <span className="varr-nome">{c.nome}</span>
                      <span className="tiny muted">
                        {barcode && <>EAN <CopiarCodigo codigo={barcode} /></>}
                        {barcode && sku ? ' · ' : ''}
                        {sku && <>SKU <CopiarCodigo codigo={sku} /></>}
                        {c.marca ? ` · ${c.marca}` : ''}
                      </span>
                      <span className="varr-avisos">
                        {c.situacao !== 'A' && <em>Inativo no Tiny</em>}
                        {c.nome_parecido && <em className="alerta">Já existe produto com este nome</em>}
                        {duplicados.has(c.tiny_id) && <em className="alerta">Código repetido no Tiny</em>}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {filtrados.length > limite && (
            <button className="secondary varr-mais" onClick={() => setLimite((l) => l + PAGINA_LISTA)}>
              Mostrar mais ({filtrados.length - limite} restantes)
            </button>
          )}

          <div className="varr-confirmar">
            <button className="primary" onClick={puxar} disabled={!marcados.size || Boolean(puxando)}>
              {puxando ?? `⬇️ Puxar ${marcados.size} selecionado(s) para o catálogo`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
