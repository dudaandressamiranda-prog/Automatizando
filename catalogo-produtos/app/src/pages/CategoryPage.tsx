import { useEffect, useMemo, useState } from 'react';
import { CardGrid } from './Home';
import { SEM_CATEGORIA, bulkSetCategory, bulkSetStatus, topLevel, useCatalog } from '../lib/catalog';
import { availableBrands, productHasBrand } from '../lib/brands';
import { useCartSaver } from '../lib/cart';
import { criarBusca } from '../lib/busca';
import { norm } from '../lib/normalize';
import { useSignedUrls } from '../lib/photos';
import { setPending } from '../lib/pending';
import type { StoreId } from '../lib/store';

interface Props {
  group: string; // 1º nível ("Acessórios") ou SEM_CATEGORIA
  initialSub?: string | null; // veio de um link direto de subcategoria (menu lateral)
  store: StoreId | null;
  email: string | null;
  admin: boolean;
}

export function CategoryPage({ group, initialSub, store, email, admin }: Props) {
  const { products, categories, loading, error, reload } = useCatalog();
  const signed = useSignedUrls(products);
  const { save } = useCartSaver(store, email);
  const [saving, setSaving] = useState(false);
  const [sub, setSub] = useState<string | null>(initialSub ?? null); // id da categoria filtrada
  const [showSearch, setShowSearch] = useState(false);
  const [q, setQ] = useState('');
  const [brand, setBrand] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, { name: string; barcode: string | null; qty: number }>>({});

  // troca de categoria pelo menu (mesma instância do componente, só props mudam)
  useEffect(() => {
    setSub(initialSub ?? null);
  }, [group, initialSub]);

  // modo "categorizar em massa" — só admin, para corrigir cadastros errados
  const [catMode, setCatMode] = useState(false);
  const [catPicked, setCatPicked] = useState<Record<string, true>>({});
  const [targetCat, setTargetCat] = useState('');
  const [applying, setApplying] = useState(false);

  const isOthers = group === SEM_CATEGORIA;
  const title = group === SEM_CATEGORIA ? 'Outros produtos' : group;

  // mantém o módulo de "seleção pendente" em dia (para o pop-up ao sair)
  useEffect(() => {
    const items = Object.entries(picked).map(([id, v]) => ({ id, name: v.name, barcode: v.barcode, qty: v.qty }));
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
      else next[id] = { name: p.name, barcode: p.barcode, qty: 1 };
      return next;
    });
  }

  // ajusta a quantidade de um item já selecionado, sem precisar abrir o carrinho
  function setQty(id: string, qty: number) {
    const val = Math.max(1, Math.round(qty) || 1);
    setPicked((cur) => (cur[id] ? { ...cur, [id]: { ...cur[id]!, qty: val } } : cur));
  }

  async function salvar() {
    const items = Object.entries(picked).map(([id, v]) => ({ id, name: v.name, barcode: v.barcode, qty: v.qty }));
    setSaving(true);
    try {
      await save(items);
      setPicked({});
      setPending(null);
    } finally {
      setSaving(false);
    }
  }

  function toggleCat(id: string) {
    setCatPicked((cur) => {
      const next = { ...cur };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  }

  function toggleCatMode() {
    setCatMode((v) => !v);
    setCatPicked({});
    setTargetCat('');
  }

  async function aplicarCategoria() {
    if (!targetCat) return;
    const ids = Object.keys(catPicked);
    setApplying(true);
    try {
      await bulkSetCategory(ids, targetCat);
      setCatPicked({});
      setTargetCat('');
      setCatMode(false);
      reload();
    } finally {
      setApplying(false);
    }
  }

  async function desativarSelecionados() {
    const ids = Object.keys(catPicked);
    if (ids.length === 0) return;
    const ok = confirm(
      `Desativar ${ids.length} produto${ids.length === 1 ? '' : 's'}? Eles saem da vitrine, mas continuam salvos — dá pra reativar depois em "A revisar".`,
    );
    if (!ok) return;
    setApplying(true);
    try {
      await bulkSetStatus(ids, 'desativado');
      setCatPicked({});
      setTargetCat('');
      setCatMode(false);
      reload();
    } finally {
      setApplying(false);
    }
  }

  const nPicked = Object.keys(picked).length;
  const nCatPicked = Object.keys(catPicked).length;
  const allCatsSorted = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [categories],
  );
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
    const casa = criarBusca(q);
    const marca = brands.find((m) => m.label === brand) ?? null;
    return scopedBase.filter((p) => {
      if (casa && !casa(`${p.name} ${p.brand ?? ''}`)) return false;
      if (marca && !productHasBrand(p, marca)) return false;
      return true;
    });
  }, [scopedBase, q, brand, brands]);

  return (
    <main className={nPicked > 0 || nCatPicked > 0 ? 'has-selbar' : ''}>
      <div className="page-head">
        <a href="#/" className="back">‹ Início</a>
        <h2>{title}</h2>
        <span className="muted small">{scoped.length} produto{scoped.length === 1 ? '' : 's'}</span>
        {admin && (
          <button
            className={`search-toggle ${catMode ? 'active' : ''}`}
            onClick={toggleCatMode}
            title="Selecionar vários produtos para mudar a categoria em massa"
          >
            🏷️
          </button>
        )}
        <button
          className="search-toggle"
          onClick={() => { setShowSearch((v) => !v); if (showSearch) { setQ(''); setBrand(null); } }}
          title="Pesquisar nesta categoria"
        >
          🔍
        </button>
      </div>

      {catMode && (
        <div className="notice">
          Modo de categorização em massa: toque nos produtos para selecionar e, lá embaixo, mude a categoria deles ou desative-os de uma vez.
        </div>
      )}

      {showSearch && (
        <div className="cat-search">
          <input
            type="search"
            placeholder={`Buscar em ${title} — use % entre palavras`}
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

      {!loading && scoped.length === 0 && !error && (
        <p className="muted center-msg">Nenhum produto nesta categoria.</p>
      )}
      <CardGrid
        products={scoped}
        signed={signed}
        selectable={catMode || Boolean(store)}
        isSelected={(id) => (catMode ? Boolean(catPicked[id]) : Boolean(picked[id]))}
        onToggle={catMode ? toggleCat : toggle}
        blockNav={catMode}
        qtyOf={catMode ? undefined : (id) => picked[id]?.qty}
        onQtyChange={catMode ? undefined : setQty}
      />

      {catMode && nCatPicked > 0 && (
        <div className="selbar selbar-cat">
          <span>{nCatPicked} selecionado{nCatPicked === 1 ? '' : 's'}</span>
          <select value={targetCat} onChange={(e) => setTargetCat(e.target.value)}>
            <option value="">Mover para…</option>
            {allCatsSorted.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button className="selbar-save" onClick={aplicarCategoria} disabled={applying || !targetCat}>
            {applying ? 'Aplicando…' : 'Aplicar'}
          </button>
          <button className="selbar-danger" onClick={desativarSelecionados} disabled={applying}>
            Desativar
          </button>
        </div>
      )}

      {!catMode && nPicked > 0 && (
        <div className="selbar">
          <span>{nPicked} selecionado{nPicked === 1 ? '' : 's'}</span>
          <button className="selbar-save" onClick={salvar} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar no carrinho'}
          </button>
        </div>
      )}
    </main>
  );
}
