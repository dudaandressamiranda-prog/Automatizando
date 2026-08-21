import { useEffect, useMemo, useState } from 'react';
import { criarBusca } from '../lib/busca';
import { useCatalog } from '../lib/catalog';
import { porDia } from '../lib/dias';
import { photoSrc, useSignedUrls } from '../lib/photos';
import {
  TIPO_ICONE, TIPO_LABEL, UNIDADES, apagarRetirada, formataQtd, listarRetiradas,
  registrarRetirada, type Retirada, type TipoRetirada, type Unidade,
} from '../lib/retiradas';
import { storeLabel, type StoreId } from '../lib/store';

interface Props {
  store: StoreId;
  email: string | null;
}

/*
 * Quem usa isto é uma pessoa só, várias vezes ao dia. O tipo e a unidade
 * ficam guardados no aparelho e o formulário não se apaga inteiro depois de
 * registrar: quem acabou de lançar 300 ml de shampoo provavelmente vai
 * lançar outro shampoo, não trocar de assunto.
 */
const PREF_TIPO = 'catalogo.retirada.tipo';
const PREF_UNIDADE = 'catalogo.retirada.unidade';

const TIPOS: TipoRetirada[] = ['banho_tosa', 'granel', 'outro'];

export function Retiradas({ store, email }: Props) {
  const { products, loading: carregandoCatalogo } = useCatalog();
  const [historico, setHistorico] = useState<Retirada[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [escolhido, setEscolhido] = useState<
    { id: string | null; nome: string; barcode: string | null; foto: string | null } | null
  >(null);
  const [tipo, setTipo] = useState<TipoRetirada>(
    () => (localStorage.getItem(PREF_TIPO) as TipoRetirada | null) ?? 'banho_tosa',
  );
  const [qtd, setQtd] = useState('');
  const [unidade, setUnidade] = useState<Unidade>(
    () => (localStorage.getItem(PREF_UNIDADE) as Unidade | null) ?? 'un',
  );
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { localStorage.setItem(PREF_TIPO, tipo); }, [tipo]);
  useEffect(() => { localStorage.setItem(PREF_UNIDADE, unidade); }, [unidade]);

  async function recarregar() {
    try {
      setHistorico(await listarRetiradas(store));
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErro(/retiradas/.test(m) ? 'Falta rodar a migration das retiradas no Supabase.' : m);
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { void recarregar(); /* eslint-disable-next-line */ }, [store]);

  const resultados = useMemo(() => {
    const casa = criarBusca(q);
    if (!casa || escolhido) return [];
    return products
      .filter((p) => casa(`${p.name} ${p.brand ?? ''} ${p.barcode ?? ''}`))
      .slice(0, 8);
  }, [q, products, escolhido]);

  // assina só o que aparece na lista — são no máximo 8, e assinar o catálogo
  // inteiro para mostrar meia dúzia de miniaturas seria trabalho jogado fora
  const assinadas = useSignedUrls(resultados);

  const quantidade = Number(qtd.replace(',', '.'));
  const podeRegistrar = Boolean(escolhido) && Number.isFinite(quantidade) && quantidade > 0 && !salvando;

  async function registrar() {
    if (!escolhido || !podeRegistrar) return;
    setSalvando(true);
    setErro(null);
    try {
      await registrarRetirada(store, {
        product_id: escolhido.id,
        product_name: escolhido.nome,
        barcode: escolhido.barcode,
        tipo,
        qty: quantidade,
        unidade,
        notes: obs,
      }, email);
      setOk(`${escolhido.nome} · ${formataQtd(quantidade, unidade)}`);
      setTimeout(() => setOk(null), 4000);
      // limpa só o que muda de um lançamento para o outro
      setEscolhido(null);
      setQ('');
      setQtd('');
      setObs('');
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  async function apagar(r: Retirada) {
    if (!confirm(`Apagar o registro de ${r.product_name} (${formataQtd(r.qty, r.unidade)})?`)) return;
    await apagarRetirada(r.id);
    await recarregar();
  }

  const hora = (iso: string) =>
    new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <main className="content">
      <div className="page-head">
        <a href="#/" className="back">‹ Início</a>
        <h1>📤 Retiradas — {storeLabel(store)}</h1>
      </div>
      <p className="muted small">
        Registro do que sai da prateleira sem passar pelo caixa. É só informativo:
        não desconta de estoque nem altera o produto.
      </p>

      {erro && <p className="error">{erro}</p>}

      <div className="ret-form">
        {escolhido ? (
          <div className="ret-escolhido">
            <span className="ret-mini">
              <span aria-hidden>🐾</span>
              {escolhido.foto && (
                <img src={escolhido.foto} alt=""
                  onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              )}
            </span>
            <span className="ret-escolhido-nome">{escolhido.nome}</span>
            {escolhido.barcode && <span className="mono tiny muted">{escolhido.barcode}</span>}
            <button className="ret-trocar" onClick={() => { setEscolhido(null); setQ(''); }}>
              trocar
            </button>
          </div>
        ) : (
          <>
            <input
              type="search"
              className="ret-busca"
              placeholder="Qual produto saiu? Nome ou código — use % entre palavras"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
            {resultados.length > 0 && (
              <ul className="ret-resultados">
                {resultados.map((p) => {
                  const foto = photoSrc(p, assinadas);
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() =>
                          setEscolhido({ id: p.id, nome: p.name, barcode: p.barcode, foto })
                        }
                      >
                        <span className="ret-mini">
                          <span aria-hidden>🐾</span>
                          {foto && (
                            <img src={foto} alt="" loading="lazy"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                          )}
                        </span>
                        <span className="ret-res-texto">
                          <span>{p.name}</span>
                          {p.barcode && <span className="mono tiny muted">{p.barcode}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {/*
              Produto fora do catálogo não pode travar o lançamento: metade do
              que existe na loja ainda está sem cadastro, e o registro do que
              foi usado vale mesmo assim.
            */}
            {q.trim().length > 2 && resultados.length === 0 && !carregandoCatalogo && (
              <button
                className="ret-livre"
                onClick={() => setEscolhido({ id: null, nome: q.trim(), barcode: null, foto: null })}
              >
                Não achei no catálogo — registrar como “{q.trim()}”
              </button>
            )}
          </>
        )}

        <div className="ret-tipos">
          {TIPOS.map((t) => (
            <button
              key={t}
              className={`ret-tipo ${tipo === t ? 'on' : ''}`}
              onClick={() => setTipo(t)}
              aria-pressed={tipo === t}
            >
              {TIPO_ICONE[t]} {TIPO_LABEL[t]}
            </button>
          ))}
        </div>

        <div className="ret-qtd">
          <label>
            Quantidade
            <input
              type="text"
              inputMode="decimal"
              placeholder="Ex.: 2,5"
              value={qtd}
              onChange={(e) => setQtd(e.target.value)}
            />
          </label>
          <label>
            Unidade
            <select value={unidade} onChange={(e) => setUnidade(e.target.value as Unidade)}>
              {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
        </div>

        <input
          type="text"
          className="ret-obs"
          placeholder="Observação (opcional)"
          value={obs}
          onChange={(e) => setObs(e.target.value)}
        />

        <button className="primary ret-registrar" onClick={registrar} disabled={!podeRegistrar}>
          {salvando ? 'Registrando…' : '✓ Registrar retirada'}
        </button>
        {!escolhido && <p className="tiny muted">Escolha o produto para liberar o registro.</p>}
        {ok && <p className="nf-ok">Registrado: {ok}</p>}
      </div>

      <h2 className="section-title">Histórico</h2>
      {carregando && <p className="muted center-msg">Carregando…</p>}
      {!carregando && historico.length === 0 && !erro && (
        <p className="muted center-msg">Nada registrado ainda.</p>
      )}

      {porDia(historico).map(({ dia, rotulo, itens }) => (
        <div key={dia} className="hist-dia">
          <h3 className="hist-data">{rotulo}</h3>
          <ul className="ret-lista">
            {itens.map((r) => (
              <li key={r.id} className="ret-item">
                <span className="ret-item-ico" title={TIPO_LABEL[r.tipo]}>{TIPO_ICONE[r.tipo]}</span>
                <span className="ret-item-texto">
                  <span className="ret-item-nome">{r.product_name}</span>
                  <span className="tiny muted">
                    {TIPO_LABEL[r.tipo]} · {hora(r.created_at)}
                    {r.created_by ? ` · ${r.created_by}` : ''}
                  </span>
                  {r.notes && <span className="tiny ret-item-obs">{r.notes}</span>}
                </span>
                <span className="ret-item-qtd">{formataQtd(r.qty, r.unidade)}</span>
                <button className="cart-del" onClick={() => apagar(r)} aria-label="Apagar registro">✕</button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </main>
  );
}
