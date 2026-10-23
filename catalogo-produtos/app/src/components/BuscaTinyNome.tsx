import { type FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  type Categoria, type FalhaPuxar, type Importado, type ItemBuscaTiny,
  buscarTinyPorNome, codigoDoCandidato, importarDoTiny, jaNoCatalogo,
} from '../lib/tiny';
import { enviarParaEtiquetas } from '../lib/zpl';
import { CopiarCodigo } from './CopiarCodigo';

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));

/** Mesma regra da função: kit/combo pelo nome não é consultado. */
const pareceKit = (nome: string) => /^\s*(kit\b|combo\b|\d+\s*x\s)/i.test(nome);
const NAO_CONSULTADO = 'Não consultado — deixe a busca mais específica';

/** Por que um resultado não pode ser importado (null = pode). */
function bloqueio(i: ItemBuscaTiny, noCatalogo: boolean): string | null {
  if (noCatalogo) return 'Já está no catálogo';
  if (i.tipo_variacao === 'P') return 'Produto "pai" — importe as variações';
  if (i.detalhe?.kit || pareceKit(i.nome)) return 'Kit — não entra no catálogo';
  if (!i.detalhe) return NAO_CONSULTADO;
  if (!i.detalhe.fotos.length) return 'Sem foto no Tiny — não pode entrar';
  return null;
}

export function BuscaTinyNome() {
  const [termo, setTermo] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [itens, setItens] = useState<ItemBuscaTiny[] | null>(null);
  const [total, setTotal] = useState(0);
  const [noCatalogo, setNoCatalogo] = useState<Map<string, string>>(new Map());
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [importados, setImportados] = useState<Importado[]>([]);
  const [falhas, setFalhas] = useState<FalhaPuxar[]>([]);

  async function buscar(e?: FormEvent, limparResultado = true) {
    e?.preventDefault();
    if (termo.trim().length < 3) return;
    setBuscando(true);
    setErro(null);
    if (limparResultado) {
      setImportados([]);
      setFalhas([]);
    }
    try {
      const r = await buscarTinyPorNome(termo.trim());
      const ja = r.itens.length ? await jaNoCatalogo(r.itens) : new Map<string, string>();
      setItens(r.itens);
      setTotal(r.total);
      setNoCatalogo(ja);
      // já vem marcado tudo que pode entrar
      setMarcados(new Set(r.itens.filter((i) => !bloqueio(i, ja.has(i.tiny_id))).map((i) => i.tiny_id)));
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setBuscando(false);
    }
  }

  function alternar(id: string) {
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function importar() {
    const escolhidos = (itens ?? []).filter((i) => marcados.has(i.tiny_id) && !bloqueio(i, noCatalogo.has(i.tiny_id)));
    if (!escolhidos.length) return;
    const semEan = escolhidos.filter((i) => !codigoDoCandidato(i).barcode).length;
    const aviso = semEan ? ` ${semEan} sem EAN no Tiny vão ganhar um EAN interno novo.` : '';
    if (!confirm(`Importar ${escolhidos.length} produto(s) do Tiny para o catálogo?${aviso}`)) return;
    setImportando(true);
    setErro(null);
    try {
      const { data: cats, error } = await supabase.from('categories').select('id, name');
      if (error) throw error;
      const r = await importarDoTiny(escolhidos, (cats ?? []) as Categoria[]);
      setImportados(r.importados);
      setFalhas(r.falhas);
      await buscar(undefined, false);
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setImportando(false);
    }
  }

  function imprimirEtiquetas() {
    enviarParaEtiquetas(
      importados.filter((i) => i.barcode).map((i) => ({ nome: i.nome, barcode: i.barcode!, copias: 1 })),
    );
    window.location.hash = '#/etiquetas';
  }

  const podem = (itens ?? []).filter((i) => !bloqueio(i, noCatalogo.has(i.tiny_id)));
  const escolhidos = podem.filter((i) => marcados.has(i.tiny_id)).length;

  return (
    <section>
      <p className="muted review-hint">
        Para produto que ainda <strong>não tem EAN</strong> no Tiny — como variações de cor
        recém-criadas. Busque pelo nome (ou pelo SKU), marque os que quer e importe. Quem não
        tem EAN ganha um <strong>EAN interno</strong> novo aqui no catálogo, e o SKU do Tiny fica
        guardado. Sem foto no Tiny não entra.
      </p>

      <form className="lv-linha nome-busca" onSubmit={buscar}>
        <input
          type="search"
          placeholder="Ex.: arranhador plataforma"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          disabled={buscando || importando}
        />
        <button type="submit" className="primary" disabled={buscando || importando || termo.trim().length < 3}>
          {buscando ? 'Buscando…' : 'Buscar'}
        </button>
      </form>
      {buscando && <p className="tiny muted">Consultando o Tiny — com foto, leva alguns segundos por produto.</p>}
      {erro && <p className="error">{erro}</p>}

      {importados.length > 0 && (
        <div className="nf-ok nome-ok">
          <span>{importados.length} produto(s) importado(s):</span>
          <ul>
            {importados.map((i) => (
              <li key={i.id}>
                <a href={`#/p/${i.id}`}>{i.nome}</a> — <span className="mono">{i.barcode}</span>
                {i.eanGerado && ' (EAN interno gerado)'}
              </li>
            ))}
          </ul>
          <button className="secondary" onClick={imprimirEtiquetas}>🖨️ Mandar para Etiquetas</button>
        </div>
      )}
      {falhas.length > 0 && (
        <details className="varr-falhas" open>
          <summary className="error">{falhas.length} não entraram</summary>
          <ul>{falhas.map((f) => <li key={f.tiny_id} className="small">{f.nome} — {f.erro}</li>)}</ul>
        </details>
      )}

      {itens && itens.length === 0 && <p className="muted">Nada encontrado no Tiny com esse nome.</p>}
      {itens?.some((i) => bloqueio(i, noCatalogo.has(i.tiny_id)) === NAO_CONSULTADO) && (
        <p className="tiny muted">
          {total} resultados no Tiny: só os 15 primeiros têm foto consultada. Se faltar algum, deixe a busca mais específica.
        </p>
      )}

      {itens && itens.length > 0 && (
        <>
          <ul className="varr-lista">
            {itens.map((i) => {
              const motivo = bloqueio(i, noCatalogo.has(i.tiny_id));
              const { barcode, sku } = codigoDoCandidato(i);
              const on = !motivo && marcados.has(i.tiny_id);
              const foto = i.detalhe?.fotos[0];
              return (
                <li key={i.tiny_id} className={`varr-item ${on ? 'on' : ''} ${motivo ? 'bloqueado' : ''}`}>
                  <label>
                    <input type="checkbox" checked={on} disabled={Boolean(motivo)} onChange={() => alternar(i.tiny_id)} />
                    {foto ? <img src={foto} alt="" loading="lazy" /> : <span className="nome-sem-foto">{i.detalhe ? 'sem foto' : ''}</span>}
                    <span className="varr-texto">
                      <span className="varr-nome">{i.nome}</span>
                      <span className="tiny muted">
                        {barcode ? <>EAN <CopiarCodigo codigo={barcode} /></> : motivo ? 'sem EAN' : 'sem EAN — será gerado'}
                        {sku && <> · SKU <CopiarCodigo codigo={sku} /></>}
                        {i.detalhe?.marca ? ` · ${i.detalhe.marca}` : ''}
                      </span>
                      <span className="varr-avisos">
                        {motivo && <em className="alerta">{motivo}</em>}
                        {noCatalogo.has(i.tiny_id) && (
                          <a href={`#/p/${noCatalogo.get(i.tiny_id)}`} className="tiny">abrir ›</a>
                        )}
                        {i.situacao !== 'A' && <em>Inativo no Tiny</em>}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="varr-confirmar">
            <button className="primary" onClick={importar} disabled={!escolhidos || importando}>
              {importando ? 'Importando…' : `⬇️ Importar ${escolhidos} selecionado(s)`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
