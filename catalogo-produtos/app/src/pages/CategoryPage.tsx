import { useEffect, useMemo, useState } from 'react';
import { CardGrid } from './Home';
import { SEM_CATEGORIA, subLevel, topLevel, useCatalog } from '../lib/catalog';
import { availableBrands, productHasBrand } from '../lib/brands';
import { useCart } from '../lib/cart';
import { norm } from '../lib/normalize';
import { photoSrc, useSignedUrls } from '../lib/photos';
import { setPending } from '../lib/pending';
import type { StoreId } from '../lib/store';

interface Props {
  group: string; // 1º nível ("Acessórios") ou SEM_CATEGORIA
  store: StoreId | null;
}

export function CategoryPage({ group, store }: Props) {
  const { products, categories, loading, error } = useCatalog();
  const signed = useSignedUrls(products);
  const cart = useCart(store);
  const [sub, setSub] = useState<string | null>(null); // id da categoria filtrada
  const [showSearch, setShowSearch] = useState(false);
  const [q, setQ] = useState('');
  const [brand, setBrand] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, { name: string; barcode: string | null }>>({});

  const isOthers = group === SEM_CATEGORIA;
  const title = group === SEM_CATEGORIA ? 'Outros produtos' : group;

  // mantém o módulo de "seleção pendente" em dia (para o pop-up ao sair)
  useEffect(() => {
    const items = Object.entries(picked).map(([id, v]) => ({ id, name: v.name, barcode: v.barcode }));
    setPending(store ? { categoria: title, items } : null);
  }, [picked, store, title]);

  // ao desmontar (saiu da categoria), não deixa lixo se já foi salvo
  useEffect(() => () => { /* pending é resolvido pelo SaveGuard no App */ }, []);

  function toggle(id: string) {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    setPicked((cur) => {
      const next = { ...cur };
      if (next[id]) delete next[id];
      else next[id] = { name: p.name, barcode: p.barcode };
      return next;
    });
  }

  function salvar() {
    const items = Object.entries(picked).map(([id, v]) => ({ id, name: v.name, barcode: v.barcode }));
    cart.addMany(items);
    setPicked({});
    setPending(null);
  }

  const nPicked = Object.keys(picked).length;
  const groupCats = useMemo(
    () => categories.filter((c) => norm(topLevel(c.name)) === norm(group)),
    [categories, group],
  );
  const groupCatIds = useMemo(() => new Set(groupCats.map((c) => c.id)), [groupCats]);

  // produtos do grupo (respeitando a subcategoria selecionada)
  const scopedBase = useMemo(
    () =>
      products.filter((p) =>
        isOthers
          ? !p.category_id || !categories.some((c) => c.id === p.category_id)
          : p.category_id !== null && groupCatIds.has(p.category_id) && (!sub || p.category_id === sub),
      ),
    [products, isOthers, categories, groupCatIds, sub],
  );

  // marcas que existem neste grupo (chips de filtro), curadas por lib/brands
  const brands = useMemo(() => availableBrands(scopedBase, group), [scopedBase, group]);

  // aplica busca por texto e filtro de marca
  const scoped = useMemo(() => {
    const term = norm(q);
    const marca = brands.find((m) => m.label === brand) ?? null;
    return scopedBase.filter((p) => {
      if (term && !norm(`${p.name} ${p.brand ?? ''}`).includes(term)) return false;
      if (marca && !productHasBrand(p, marca)) return false;
      return true;
    });
  }, [scopedBase, q, brand, brands]);

  /** Subcategorias com foto — só quando o grupo tem mais de uma. */
  const subTiles = useMemo(() => {
    if (isOthers || groupCats.length <= 1) return [];
    return groupCats.map((c) => {
      const inCat = products.filter((p) => p.category_id === c.id);
      const withPhoto = inCat.find((p) => photoSrc(p, signed));
      return {
        id: c.id,
        label: subLevel(c.name) ?? c.name,
        count: inCat.length,
        photo: withPhoto ? photoSrc(withPhoto, signed) : null,
      };
    }).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [isOthers, groupCats, products, signed]);

  return (
    <main className={nPicked > 0 ? 'has-selbar' : ''}>
      <div className="page-head">
        <a href="#/" className="back">‹ Início</a>
        <h2>{title}</h2>
        <span className="muted small">{scoped.length} produto{scoped.length === 1 ? '' : 's'}</span>
        <button
          className="search-toggle"
          onClick={() => { setShowSearch((v) => !v); if (showSearch) { setQ(''); setBrand(null); } }}
          title="Pesquisar nesta categoria"
        >
          🔍
        </button>
      </div>

      {showSearch && (
        <div className="cat-search">
          <input
            type="search"
            placeholder={`Buscar em ${title}…`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          {brands.length > 0 && (
            <div className="brand-chips">
              {brands.map((m) => (
                <button
                  key={m.label}
                  className={`chip ${brand === m.label ? 'active' : ''}`}
                  onClick={() => setBrand(brand === m.label ? null : m.label)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted center-msg">Carregando…</p>}

      {subTiles.length > 0 && (
        <div className="cat-grid subcats">
          <button className={`cat-tile ${sub === null ? 'active' : ''}`} onClick={() => setSub(null)}>
            <span className="cat-photo"><span aria-hidden>✳️</span></span>
            <span className="cat-name">Tudo</span>
          </button>
          {subTiles.map((t) => (
            <button
              key={t.id}
              className={`cat-tile ${sub === t.id ? 'active' : ''}`}
              onClick={() => setSub(sub === t.id ? null : t.id)}
            >
              <span className="cat-photo">
                <span aria-hidden>🐾</span>
                {t.photo && (
                  <img
                    src={t.photo}
                    alt=""
                    loading="lazy"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
              </span>
              <span className="cat-name">{t.label}</span>
              <span className="tiny muted">{t.count}</span>
            </button>
          ))}
        </div>
      )}

      {!loading && scoped.length === 0 && !error && (
        <p className="muted center-msg">Nenhum produto nesta categoria.</p>
      )}
      <CardGrid
        products={scoped}
        signed={signed}
        selectable={Boolean(store)}
        isSelected={(id) => Boolean(picked[id]) || cart.has(id)}
        onToggle={toggle}
      />

      {nPicked > 0 && (
        <div className="selbar">
          <span>{nPicked} selecionado{nPicked === 1 ? '' : 's'}</span>
          <button className="selbar-save" onClick={salvar}>Salvar no carrinho</button>
        </div>
      )}
    </main>
  );
}
