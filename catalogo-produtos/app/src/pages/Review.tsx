import { useEffect, useMemo, useState } from 'react';
import { ProductCard } from '../components/ProductCard';
import { criarBusca } from '../lib/busca';
import { photoSrc, useSignedUrls } from '../lib/photos';
import { supabase } from '../lib/supabase';
import { LIST_COLUMNS, type ListProduct } from '../lib/types';

const PAGE = 1000;

type Ordem = 'nome' | 'recente';

/**
 * Todo produto fora da vitrine (status diferente de ativo), qualquer que
 * seja o motivo — sem código, sem foto, ou desativado à mão. O nome do
 * menu é "sem código" por causa da origem da tela, mas a consulta nunca
 * filtrou por isso: quem só ficou sem foto (e já foi completada depois)
 * também para aqui, esperando alguém ativar.
 */
export function Review() {
  const [products, setProducts] = useState<ListProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [ordem, setOrdem] = useState<Ordem>('nome');
  const [ativando, setAtivando] = useState<string | null>(null);

  /**
   * Ativa direto desta tela — sem abrir o formulário — para quem já
   * conferiu que a foto e os dados estão certos. Continua sendo uma
   * decisão tomada por alguém, clique a clique: status_manual marca isso.
   */
  async function ativar(id: string) {
    setAtivando(id);
    try {
      const { error: err } = await supabase
        .from('products')
        .update({ status: 'ativo', status_manual: true })
        .eq('id', id);
      if (err) throw err;
      setProducts((ps) => ps.filter((p) => p.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAtivando(null);
    }
  }

  useEffect(() => {
    let alive = true;
    async function load() {
      const todos: ListProduct[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error: err } = await supabase
          .from('products')
          .select(LIST_COLUMNS)
          .neq('status', 'ativo')
          .order('name')
          .range(from, from + PAGE - 1);
        if (!alive) return;
        if (err) {
          setError(err.message);
          break;
        }
        todos.push(...((data ?? []) as ListProduct[]));
        setProducts([...todos]);
        if (!data || data.length < PAGE) break;
      }
      setLoading(false);
    }
    void load();
    return () => {
      alive = false;
    };
  }, []);

  const signed = useSignedUrls(products);

  const filtered = useMemo(() => {
    const casa = criarBusca(q);
    // código de barras entra na busca: é como alguém acha o produto
    // "sumido" que trava um cadastro novo por código duplicado — sem
    // achar aqui (a única tela que mostra QUALQUER situação), não tinha
    // como saber quem já é dono daquele código.
    const base = casa ? products.filter((p) => casa(`${p.name} ${p.brand ?? ''} ${p.barcode ?? ''}`)) : products;
    if (ordem === 'nome') return base;
    // mais recente primeiro — acha na hora quem acabou de entrar ou de
    // ganhar foto, sem rolar uma lista grande em ordem alfabética
    return [...base].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }, [q, products, ordem]);

  return (
    <main className="content">
      <div className="page-head">
        <h1>Produtos a revisar</h1>
        <span className="muted small">{products.length} fora da vitrine</span>
      </div>
      <p className="muted review-hint">
        Produtos desativados, por qualquer motivo — sem código, sem foto, ou
        desativado à mão. Complete o que faltar e ative, ou, se já estiver
        tudo certo (por exemplo, a foto foi adicionada depois), clique
        direto em <strong>✓ Ativar</strong> no card.
      </p>

      <div className="searchbar">
        <input
          type="search"
          placeholder="Filtrar por nome, marca ou código de barras"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="pend-ordem">
        <span className="muted small">Ordenar por</span>
        {([
          ['recente', 'Mais recente'],
          ['nome', 'Produto'],
        ] as [Ordem, string][]).map(([id, rotulo]) => (
          <button
            key={id}
            className={`pend-sort ${ordem === id ? 'on' : ''}`}
            onClick={() => setOrdem(id)}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {error && <p className="error">Erro: {error}</p>}
      {loading && <p className="muted center-msg">Carregando…</p>}
      {!loading && filtered.length === 0 && (
        <p className="muted center-msg">
          {q ? 'Nenhum produto encontrado.' : 'Nada fora da vitrine. 🎉'}
        </p>
      )}

      <div className="card-grid">
        {filtered.map((p) => (
          <div key={p.id} className="rev-card">
            <ProductCard product={p} src={photoSrc(p, signed)} />
            <button
              type="button"
              className="rev-ativar"
              onClick={() => ativar(p.id)}
              disabled={ativando === p.id}
              title="Ativar sem abrir o formulário"
            >
              {ativando === p.id ? 'Ativando…' : '✓ Ativar'}
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}
