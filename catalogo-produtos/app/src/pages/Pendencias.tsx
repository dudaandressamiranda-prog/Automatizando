import { useEffect, useMemo, useState } from 'react';
import { criarBusca } from '../lib/busca';
import { photoSrc, useSignedUrls } from '../lib/photos';
import { supabase } from '../lib/supabase';
import { LIST_COLUMNS, STATUS_LABEL, type ListProduct } from '../lib/types';

const PAGE = 1000;

type Filtro = 'todos' | 'foto' | 'codigo' | 'ambos';
type Campo = 'nome' | 'marca' | 'situacao' | 'recente';

const temFoto = (p: ListProduct) => Boolean(p.photo_path || p.photo_source_url);
const temCodigo = (p: ListProduct) => Boolean(p.barcode);

/**
 * Cadastros incompletos: falta foto, código de barras, ou os dois.
 *
 * É separada da tela "A revisar" de propósito. Lá estão os desativados em
 * geral, seja qual for o motivo; aqui é só o que está esperando um dado
 * para ficar pronto — a fila de trabalho de quem senta para completar
 * cadastro, em ordem alfabética e com as colunas ordenáveis.
 */
export function Pendencias() {
  const [produtos, setProdutos] = useState<ListProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [campo, setCampo] = useState<Campo>('nome');
  const [crescente, setCrescente] = useState(true);

  useEffect(() => {
    let vivo = true;
    async function load() {
      const todos: ListProduct[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error: err } = await supabase
          .from('products')
          .select(LIST_COLUMNS)
          // falta foto (nenhuma das duas origens) OU falta código
          .or('and(photo_path.is.null,photo_source_url.is.null),barcode.is.null')
          .order('name')
          .range(from, from + PAGE - 1);
        if (!vivo) return;
        if (err) {
          setError(err.message);
          break;
        }
        todos.push(...((data ?? []) as ListProduct[]));
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
    const filtrados = produtos.filter((p) => {
      if (casa && !casa(`${p.name} ${p.brand ?? ''} ${p.barcode ?? ''}`)) return false;
      if (filtro === 'foto') return !temFoto(p);
      if (filtro === 'codigo') return !temCodigo(p);
      if (filtro === 'ambos') return !temFoto(p) && !temCodigo(p);
      return true;
    });

    // "recente" ordena por quando o cadastro mudou por último — é o que
    // acha rápido quem acabou de entrar por uma nota, sem precisar rolar
    // uma lista de milhares em ordem alfabética
    if (campo === 'recente') {
      return [...filtrados].sort((a, b) => {
        const cmp = a.updated_at.localeCompare(b.updated_at);
        return crescente ? cmp : -cmp;
      });
    }

    const chave = (p: ListProduct) =>
      campo === 'marca' ? p.brand ?? '' : campo === 'situacao' ? p.status : p.name;
    return filtrados.sort((a, b) => {
      // sem marca vai para o fim nas duas direções: linha vazia no topo não ajuda ninguém
      const va = chave(a);
      const vb = chave(b);
      if (!va !== !vb) return va ? -1 : 1;
      const cmp = va.localeCompare(vb, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR');
      return crescente ? cmp : -cmp;
    });
  }, [produtos, q, filtro, campo, crescente]);

  const contagem = useMemo(
    () => ({
      foto: produtos.filter((p) => !temFoto(p)).length,
      codigo: produtos.filter((p) => !temCodigo(p)).length,
      ambos: produtos.filter((p) => !temFoto(p) && !temCodigo(p)).length,
    }),
    [produtos],
  );

  function ordenarPor(c: Campo) {
    if (c === campo) setCrescente((v) => !v);
    else {
      setCampo(c);
      // "recente" começa do mais novo pro mais velho — é pra isso que
      // alguém escolhe essa ordem; os outros campos começam A→Z de sempre
      setCrescente(c !== 'recente');
    }
  }

  const seta = (c: Campo) => (campo !== c ? '↕' : crescente ? '↑' : '↓');

  return (
    <main className="content">
      <div className="page-head">
        <a href="#/" className="back">‹ Início</a>
        <h1>📦 A completar</h1>
        <span className="muted small">
          {lista.length} produto{lista.length === 1 ? '' : 's'}
        </span>
      </div>
      <p className="muted small">
        Cadastros a que falta foto ou código de barras. Complete e ative — assim
        que os dois estiverem preenchidos, o produto sai desta lista.
      </p>

      <div className="filtros">
        <input
          type="search"
          placeholder="Buscar por nome, marca ou código de barras"
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

      <div className="pend-ordem">
        <span className="muted small">Ordenar por</span>
        {([
          ['recente', 'Mais recente'],
          ['nome', 'Produto'],
          ['marca', 'Marca'],
          ['situacao', 'Situação'],
        ] as [Campo, string][]).map(([id, rotulo]) => (
          <button
            key={id}
            className={`pend-sort ${campo === id ? 'on' : ''}`}
            onClick={() => ordenarPor(id)}
            title={campo === id ? (crescente ? 'Crescente — clique para inverter' : 'Decrescente — clique para inverter') : `Ordenar por ${rotulo}`}
          >
            {rotulo} <span aria-hidden>{seta(id)}</span>
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

                <span className={`badge badge-${p.status}`}>{STATUS_LABEL[p.status]}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
