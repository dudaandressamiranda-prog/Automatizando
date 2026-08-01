import { useEffect, useMemo, useState } from 'react';
import { criarBusca } from '../lib/busca';
import { photoSrc, useSignedUrls } from '../lib/photos';
import { supabase } from '../lib/supabase';
import type { ListProduct } from '../lib/types';

const PAGE = 1000;

const COLUNAS =
  'id, name, barcode, brand, category_id, photo_path, photo_source_url, status, updated_at,' +
  ' stock_centro, stock_eldorado, stock_erp, stock_total';

interface Pendente extends ListProduct {
  stock_centro: number | null;
  stock_eldorado: number | null;
  stock_erp: number | null;
  stock_total: number;
}

type Filtro = 'todos' | 'foto' | 'codigo' | 'ambos';

const temFoto = (p: Pendente) => Boolean(p.photo_path || p.photo_source_url);
const temCodigo = (p: Pendente) => Boolean(p.barcode);

/**
 * Produtos que estão na prateleira mas ainda não podem ir para a vitrine:
 * têm estoque e falta foto, código de barras, ou os dois.
 *
 * É separada da tela "A revisar" de propósito. Lá estão os desativados em
 * geral, muitos parados de vez; aqui é só o que tem mercadoria esperando —
 * a fila que dá retorno imediato quando alguém senta para completar
 * cadastro. Ordenada pelo estoque, para render mais quem tem mais peça
 * parada sem aparecer na busca das lojas.
 */
export function Pendencias() {
  const [produtos, setProdutos] = useState<Pendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');

  useEffect(() => {
    let vivo = true;
    async function load() {
      const todos: Pendente[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error: err } = await supabase
          .from('products')
          .select(COLUNAS)
          .gt('stock_total', 0)
          .or('and(photo_path.is.null,photo_source_url.is.null),barcode.is.null')
          .order('stock_total', { ascending: false })
          .range(from, from + PAGE - 1);
        if (!vivo) return;
        if (err) {
          // a coluna só existe depois da migration do estoque
          setError(
            /stock_total/.test(err.message)
              ? 'Falta rodar a migration do estoque (20260801000006_estoque.sql) no Supabase.'
              : err.message,
          );
          break;
        }
        todos.push(...((data ?? []) as unknown as Pendente[]));
        setProdutos([...todos]);
        if (!data || data.length < PAGE) break;
      }
      if (vivo) setLoading(false);
    }
    void load();
    return () => { vivo = false; };
  }, []);

  const signed = useSignedUrls(produtos);

  const lista = useMemo(() => {
    const casa = criarBusca(q);
    return produtos.filter((p) => {
      if (casa && !casa(`${p.name} ${p.brand ?? ''}`)) return false;
      if (filtro === 'foto') return !temFoto(p);
      if (filtro === 'codigo') return !temCodigo(p);
      if (filtro === 'ambos') return !temFoto(p) && !temCodigo(p);
      return true;
    });
  }, [produtos, q, filtro]);

  const contagem = useMemo(
    () => ({
      foto: produtos.filter((p) => !temFoto(p)).length,
      codigo: produtos.filter((p) => !temCodigo(p)).length,
      ambos: produtos.filter((p) => !temFoto(p) && !temCodigo(p)).length,
    }),
    [produtos],
  );

  const pecas = lista.reduce((s, p) => s + p.stock_total, 0);

  return (
    <main className="content">
      <div className="page-head">
        <a href="#/" className="back">‹ Início</a>
        <h1>📦 Na prateleira</h1>
        <span className="muted small">
          {lista.length} produto{lista.length === 1 ? '' : 's'} · {pecas} peça{pecas === 1 ? '' : 's'}
        </span>
      </div>
      <p className="muted small">
        Tem estoque na loja mas falta foto ou código de barras — por isso ainda não
        aparece na vitrine. Complete o cadastro e ative.
      </p>

      <div className="filtros">
        <input
          type="search"
          placeholder="Buscar por nome ou marca — use % entre palavras"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="pend-abas">
        {([
          ['todos', `Todos (${produtos.length})`],
          ['foto', `Falta foto (${contagem.foto})`],
          ['codigo', `Falta código (${contagem.codigo})`],
          ['ambos', `Falta os dois (${contagem.ambos})`],
        ] as [Filtro, string][]).map(([id, rotulo]) => (
          <button
            key={id}
            className={`pend-aba ${filtro === id ? 'on' : ''}`}
            onClick={() => setFiltro(id)}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted center-msg">Carregando…</p>}
      {!loading && lista.length === 0 && !error && (
        <p className="muted center-msg">Nada pendente por aqui. 🎉</p>
      )}

      <ul className="pend-lista">
        {lista.map((p) => {
          const src = photoSrc(p, signed);
          return (
            <li key={p.id}>
              <a href={`#/p/${p.id}`} className="pend-item">
                <span className="pend-foto">
                  {src ? <img src={src} alt="" loading="lazy" /> : <span aria-hidden>🐾</span>}
                </span>

                <span className="pend-texto">
                  <span className="pend-nome">{p.name}</span>
                  <span className="muted small">{p.brand || '—'}</span>
                  <span className="pend-faltas">
                    {!temFoto(p) && <span className="pend-falta">sem foto</span>}
                    {!temCodigo(p) && <span className="pend-falta">sem código</span>}
                    {p.barcode && <span className="mono tiny muted">{p.barcode}</span>}
                  </span>
                </span>

                <span className="pend-estoque" title="Centro · Eldorado · Tiny">
                  <strong>{p.stock_total}</strong>
                  <span className="tiny muted">
                    {p.stock_centro ?? 0} · {p.stock_eldorado ?? 0} · {p.stock_erp ?? 0}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
