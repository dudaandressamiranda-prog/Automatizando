import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { ProductCard } from '../components/ProductCard';
import { topRequested } from '../lib/cart';
import { SEM_CATEGORIA, topLevel, useCatalog } from '../lib/catalog';
import { APP_NAME, APP_TAGLINE } from '../lib/config';
import { cleanBarcode, norm } from '../lib/normalize';
import { photoSrc, useSignedUrls } from '../lib/photos';
import type { ListProduct } from '../lib/types';

// A biblioteca de leitura de código é pesada — só baixa quando abrir a câmera.
const Scanner = lazy(() =>
  import('../components/Scanner').then((m) => ({ default: m.Scanner })),
);

interface Props {
  navigate: (hash: string) => void;
}

export function Home({ navigate }: Props) {
  const [q, setQ] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanMiss, setScanMiss] = useState<string | null>(null);
  const { products, categories, loading, error } = useCatalog();
  const signed = useSignedUrls(products);

  const catNameById = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  /** Tiles de categoria (1º nível), com foto de um produto do grupo e contagem. */
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; count: number; photo: string | null }>();
    for (const p of products) {
      const catName = p.category_id ? catNameById.get(p.category_id) : undefined;
      const key = catName ? topLevel(catName) : SEM_CATEGORIA;
      const label = catName ? topLevel(catName) : 'Outros produtos';
      const g = map.get(key) ?? { name: label, count: 0, photo: null };
      g.count++;
      if (!g.photo) g.photo = photoSrc(p, signed);
      map.set(key, g);
    }
    return [...map.entries()]
      .map(([key, g]) => ({ key, ...g }))
      .sort((a, b) =>
        a.key === SEM_CATEGORIA ? 1 : b.key === SEM_CATEGORIA ? -1 : a.name.localeCompare(b.name, 'pt-BR'),
      );
  }, [products, catNameById, signed]);

  /** Busca no aparelho: nome+marca sem acento, ou código de barras. */
  const results = useMemo(() => {
    const term = norm(q);
    if (!term) return null;
    const digits = cleanBarcode(q);
    return products.filter((p) => {
      if (digits && p.barcode === digits) return true;
      return `${norm(p.name)} ${norm(p.brand ?? '')}`.includes(term);
    });
  }, [q, products]);

  const recent = useMemo(
    () =>
      [...products]
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, 8),
    [products],
  );

  // Destaques = produtos mais pedidos nos carrinhos; recentes como reserva
  const [topIds, setTopIds] = useState<string[] | null>(null);
  useEffect(() => { topRequested(12).then(setTopIds); }, []);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const featured = useMemo(() => {
    const top = (topIds ?? [])
      .map((id) => byId.get(id))
      .filter((p): p is typeof products[number] => Boolean(p));
    return top.length > 0 ? top : recent;
  }, [topIds, byId, recent, products]);
  const featuredTitle = featured !== recent ? '✨ Mais pedidos' : '✨ Destaques';

  function onScan(code: string) {
    setScanning(false);
    setScanMiss(null);
    const found = products.find((p) => p.barcode === code);
    if (found) navigate(`/p/${found.id}`);
    else {
      setQ(code);
      setScanMiss(code);
    }
  }

  return (
    <main className="home">
      {/* Banner de destaque com busca em evidência */}
      <section className="hero">
        <div className="hero-inner">
          <img src="/icon.png" alt="" className="hero-logo" />
          <h1 className="hero-title">{APP_NAME}</h1>
          <p className="hero-tagline">{APP_TAGLINE}</p>
          <div className="hero-search">
            <input
              type="search"
              placeholder="Buscar por nome, marca ou código de barras…"
              value={q}
              onChange={(e) => { setQ(e.target.value); setScanMiss(null); }}
            />
            <button onClick={() => setScanning(true)} title="Ler código de barras">📷</button>
          </div>
        </div>
      </section>

      {scanning && (
        <Suspense fallback={<p className="muted">Abrindo câmera…</p>}>
          <Scanner onResult={onScan} onClose={() => setScanning(false)} />
        </Suspense>
      )}

      {scanMiss && (
        <div className="notice">
          Nenhum produto com o código <strong>{scanMiss}</strong>.{' '}
          <a href={`#/novo?barcode=${scanMiss}`}>Cadastrar agora</a>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted center-msg">Carregando catálogo…</p>}

      {!loading && results && (
        <>
          <h2 className="section-title">{results.length} resultado{results.length === 1 ? '' : 's'}</h2>
          {results.length === 0 && <p className="muted center-msg">Nenhum produto encontrado.</p>}
          <CardGrid products={results} signed={signed} />
        </>
      )}

      {!loading && !results && (
        <>
          {products.length === 0 && !error && (
            <p className="muted center-msg">Catálogo vazio — cadastre o primeiro produto.</p>
          )}
          {groups.length > 0 && (
            <>
              <h2 className="section-title">Categorias</h2>
              <div className="cat-grid">
                {groups.map((g) => (
                  <a key={g.key} href={`#/c/${encodeURIComponent(g.key)}`} className="cat-tile">
                    <span className="cat-photo">
                      <span aria-hidden>🐾</span>
                      {g.photo && (
                        <img
                          src={g.photo}
                          alt=""
                          loading="lazy"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      )}
                    </span>
                    <span className="cat-name">{g.name}</span>
                    <span className="tiny muted">{g.count}</span>
                  </a>
                ))}
              </div>
            </>
          )}
          {featured.length > 0 && (
            <>
              <h2 className="section-title">{featuredTitle}</h2>
              <CardGrid products={featured} signed={signed} />
            </>
          )}
        </>
      )}

      <a href="#/novo" className="fab" title="Cadastrar produto">+</a>
    </main>
  );
}

const PAGINA = 60;

/**
 * Mostra os produtos em cards, de 60 em 60 — uma categoria grande tem
 * centenas de itens e renderizar tudo de uma vez trava o celular.
 */
interface GridProps {
  products: ListProduct[];
  signed: Record<string, string>;
  selectable?: boolean;
  isSelected?: (id: string) => boolean;
  onToggle?: (id: string) => void;
}

export function CardGrid({ products, signed, selectable, isSelected, onToggle }: GridProps) {
  const [limite, setLimite] = useState(PAGINA);
  const chave = products.length > 0 ? products[0]!.id : '';

  // lista mudou (busca nova, outra categoria): volta para a primeira página
  useEffect(() => setLimite(PAGINA), [chave, products.length]);

  const visiveis = products.slice(0, limite);
  return (
    <>
      <div className="card-grid">
        {visiveis.map((p) => (
          <ProductCard
            key={p.id}
            product={p}
            src={photoSrc(p, signed)}
            selectable={selectable}
            selected={isSelected?.(p.id)}
            onToggle={onToggle}
          />
        ))}
      </div>
      {products.length > limite && (
        <button className="secondary mais" onClick={() => setLimite((l) => l + PAGINA)}>
          Mostrar mais ({products.length - limite} restantes)
        </button>
      )}
    </>
  );
}
