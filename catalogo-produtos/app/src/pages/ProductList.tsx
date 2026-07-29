import { lazy, Suspense, useEffect, useRef, useState } from 'react';

// A biblioteca de leitura de código é pesada — só baixa quando abrir a câmera.
const Scanner = lazy(() =>
  import('../components/Scanner').then((m) => ({ default: m.Scanner })),
);
import { cleanBarcode, norm } from '../lib/normalize';
import { PHOTO_BUCKET, supabase } from '../lib/supabase';
import { STATUS_LABEL, type Category, type Product } from '../lib/types';

const PAGE_SIZE = 50;

interface Props {
  navigate: (hash: string) => void;
}

export function ProductList({ navigate }: Props) {
  const [q, setQ] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Map<string, Category>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMiss, setScanMiss] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  // Fotos que estão no bucket privado precisam de URL assinada — pede
  // todas de uma vez para a página atual (1 chamada, não 1 por produto).
  useEffect(() => {
    const paths = products
      .map((p) => p.photo_path)
      .filter((x): x is string => Boolean(x));
    if (paths.length === 0) {
      setSignedUrls({});
      return;
    }
    supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(paths, 3600)
      .then(({ data }) => {
        if (!data) return;
        const m: Record<string, string> = {};
        for (const d of data) {
          if (d.path && d.signedUrl) m[d.path] = d.signedUrl;
        }
        setSignedUrls(m);
      });
  }, [products]);

  useEffect(() => {
    supabase
      .from('categories')
      .select('id, name')
      .then(({ data }) => {
        if (data) setCategories(new Map(data.map((c) => [c.id, c])));
      });
  }, []);

  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      void search(q);
    }, 250);
    return () => clearTimeout(debounce.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function search(term: string) {
    setLoading(true);
    setError(null);

    let query = supabase.from('products').select('*').limit(PAGE_SIZE);
    const barcode = cleanBarcode(term);
    const normTerm = norm(term);

    if (barcode) {
      // Só dígitos: procura por código de barras E por trecho do nome
      // (tem produto com número no nome, ex. "Ração 15kg").
      query = query.or(`barcode.eq.${barcode},dedupe_key.ilike.*${barcode}*`);
    } else if (normTerm) {
      // dedupe_key = nome+marca já normalizados no banco → busca sem acento.
      query = query.ilike('dedupe_key', `%${normTerm}%`);
    } else {
      query = query.order('updated_at', { ascending: false });
    }

    const { data, error: err } = await query;
    setLoading(false);
    if (err) {
      setError(`Erro na busca: ${err.message}`);
      return;
    }
    setProducts(data ?? []);
  }

  async function onScan(code: string) {
    setScanning(false);
    setScanMiss(null);
    const { data } = await supabase.from('products').select('id').eq('barcode', code).maybeSingle();
    if (data) {
      navigate(`/p/${data.id}`);
    } else {
      setQ(code);
      setScanMiss(code);
    }
  }

  return (
    <main>
      <div className="searchbar">
        <input
          type="search"
          placeholder="Nome, marca ou código de barras…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <button className="secondary" onClick={() => setScanning(true)} title="Ler código de barras">
          📷
        </button>
      </div>

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
      {loading && <p className="muted">Buscando…</p>}

      {!loading && products.length === 0 && !error && (
        <p className="muted center-msg">
          {q ? 'Nenhum produto encontrado.' : 'Catálogo vazio — cadastre o primeiro produto.'}
        </p>
      )}

      <ul className="product-list">
        {products.map((p) => {
          const thumb =
            (p.photo_path && signedUrls[p.photo_path]) || p.photo_source_url || null;
          return (
          <li key={p.id}>
            <a href={`#/p/${p.id}`} className="product-row">
              <div className="thumb">
                <span aria-hidden>🐾</span>
                {thumb && (
                  <img
                    src={thumb}
                    alt=""
                    loading="lazy"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
              </div>
              <div className="product-main">
                <span className="product-name">{p.name}</span>
                <span className="muted small">
                  {[p.brand, categories.get(p.category_id ?? '')?.name]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </span>
                {p.barcode && <span className="mono small muted">{p.barcode}</span>}
              </div>
              {p.status !== 'ativo' && (
                <span className={`badge badge-${p.status}`}>{STATUS_LABEL[p.status]}</span>
              )}
            </a>
          </li>
          );
        })}
      </ul>

      <a href="#/novo" className="fab" title="Cadastrar produto">+</a>
    </main>
  );
}
