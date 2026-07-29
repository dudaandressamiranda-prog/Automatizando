import { useMemo, useState } from 'react';
import { CardGrid } from './Home';
import { SEM_CATEGORIA, subLevel, topLevel, useCatalog } from '../lib/catalog';
import { norm } from '../lib/normalize';
import { photoSrc, useSignedUrls } from '../lib/photos';

interface Props {
  group: string; // 1º nível ("Acessórios") ou SEM_CATEGORIA
}

export function CategoryPage({ group }: Props) {
  const { products, categories, loading, error } = useCatalog();
  const signed = useSignedUrls(products);
  const [sub, setSub] = useState<string | null>(null); // id da categoria filtrada

  const isOthers = group === SEM_CATEGORIA;
  const groupCats = useMemo(
    () => categories.filter((c) => norm(topLevel(c.name)) === norm(group)),
    [categories, group],
  );
  const groupCatIds = useMemo(() => new Set(groupCats.map((c) => c.id)), [groupCats]);

  const scoped = useMemo(
    () =>
      products.filter((p) =>
        isOthers
          ? !p.category_id || !categories.some((c) => c.id === p.category_id)
          : p.category_id !== null && groupCatIds.has(p.category_id) && (!sub || p.category_id === sub),
      ),
    [products, isOthers, categories, groupCatIds, sub],
  );

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

  const title = isOthers ? 'Outros produtos' : group;

  return (
    <main>
      <div className="page-head">
        <a href="#/" className="back">‹ Início</a>
        <h2>{title}</h2>
        <span className="muted small">{scoped.length} produto{scoped.length === 1 ? '' : 's'}</span>
      </div>

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
      <CardGrid products={scoped} signed={signed} />

      <a href="#/novo" className="fab" title="Cadastrar produto">+</a>
    </main>
  );
}
