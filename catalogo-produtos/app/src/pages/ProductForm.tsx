import { type FormEvent, useEffect, useState } from 'react';
import { Photo } from '../components/Photo';
import { cleanBarcode, norm } from '../lib/normalize';
import { PHOTO_BUCKET, supabase } from '../lib/supabase';
import { STATUS_LABEL, type Category, type Product, type ProductStatus } from '../lib/types';

const NEW_CATEGORY = '__nova__';

interface Props {
  navigate: (hash: string) => void;
  productId?: string;
  initialBarcode?: string;
}

export function ProductForm({ navigate, productId, initialBarcode }: Props) {
  const editing = Boolean(productId);

  const [loaded, setLoaded] = useState(!editing);
  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState(initialBarcode ?? '');
  const [brand, setBrand] = useState('');
  const [supplier, setSupplier] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [status, setStatus] = useState<ProductStatus>('ativo');
  const [notes, setNotes] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .from('categories')
      .select('id, name')
      .order('name')
      .then(({ data }) => setCategories(data ?? []));
  }, []);

  useEffect(() => {
    if (!productId) return;
    supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err || !data) {
          setError('Produto não encontrado.');
          setLoaded(true);
          return;
        }
        const p = data as Product;
        setProduct(p);
        setName(p.name);
        setBarcode(p.barcode ?? '');
        setBrand(p.brand ?? '');
        setSupplier(p.supplier ?? '');
        setCategoryId(p.category_id ?? '');
        setStatus(p.status);
        setNotes(p.notes ?? '');
        setLoaded(true);
      });
  }, [productId]);

  /** Cria a categoria (ou reaproveita uma existente que só difere em acento/caixa). */
  async function resolveCategory(): Promise<string | null> {
    if (categoryId !== NEW_CATEGORY) return categoryId || null;
    const wanted = newCategory.trim();
    if (!wanted) return null;

    const existing = categories.find((c) => norm(c.name) === norm(wanted));
    if (existing) return existing.id;

    const { data, error: err } = await supabase
      .from('categories')
      .insert({ name: wanted })
      .select('id')
      .single();
    if (err) {
      // 23505 = outra pessoa criou a mesma categoria nesse meio-tempo
      if (err.code === '23505') {
        const { data: all } = await supabase.from('categories').select('id, name');
        const found = (all ?? []).find((c) => norm(c.name) === norm(wanted));
        if (found) return found.id;
      }
      throw new Error(`Não foi possível criar a categoria: ${err.message}`);
    }
    return data.id;
  }

  async function uploadPhoto(id: string): Promise<void> {
    if (!photoFile) return;
    const ext = (photoFile.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `products/${id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, photoFile, { contentType: photoFile.type || 'image/jpeg' });
    if (upErr) throw new Error(`A foto não subiu: ${upErr.message}`);
    const { error: updErr } = await supabase
      .from('products')
      .update({ photo_path: path, photo_updated_at: new Date().toISOString() })
      .eq('id', id);
    if (updErr) throw new Error(`Foto salva, mas não foi vinculada: ${updErr.message}`);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanName = name.trim();
    if (!cleanName) {
      setError('O nome é obrigatório.');
      return;
    }
    let barcodeValue: string | null = null;
    if (barcode.trim()) {
      barcodeValue = cleanBarcode(barcode);
      if (!barcodeValue) {
        setError('Código de barras inválido — use só números (6 a 14 dígitos).');
        return;
      }
    }

    setBusy(true);
    try {
      const catId = await resolveCategory();
      const fields = {
        name: cleanName,
        barcode: barcodeValue,
        brand: brand.trim() || null,
        supplier: supplier.trim() || null,
        category_id: catId,
        status,
        notes: notes.trim() || null,
      };

      let id = productId;
      if (editing) {
        const { error: err } = await supabase.from('products').update(fields).eq('id', id!);
        if (err) throw friendlyDbError(err);
      } else {
        const { data, error: err } = await supabase
          .from('products')
          .insert({ ...fields, source: 'manual' })
          .select('id')
          .single();
        if (err) throw friendlyDbError(err);
        id = data.id;
      }

      await uploadPhoto(id!);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!productId) return;
    if (!window.confirm(`Excluir "${product?.name ?? 'este produto'}"? Não dá para desfazer.`)) return;
    setBusy(true);
    const { error: err } = await supabase.from('products').delete().eq('id', productId);
    setBusy(false);
    if (err) {
      setError(`Não foi possível excluir: ${err.message}`);
      return;
    }
    navigate('/');
  }

  if (!loaded) return <main><p className="muted">Carregando…</p></main>;

  return (
    <main>
      <form onSubmit={onSubmit} className="card form">
        <h2>{editing ? 'Editar produto' : 'Novo produto'}</h2>

        {product?.photo_path && <Photo path={product.photo_path} alt={product.name} />}

        <label>
          Nome *
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>

        <label>
          Código de barras
          <input
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            inputMode="numeric"
            placeholder="6 a 14 dígitos (opcional)"
          />
        </label>

        <label>
          Marca
          <input value={brand} onChange={(e) => setBrand(e.target.value)} />
        </label>

        <label>
          Fornecedor
          <input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        </label>

        <label>
          Categoria
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">— sem categoria —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
            <option value={NEW_CATEGORY}>+ nova categoria…</option>
          </select>
        </label>

        {categoryId === NEW_CATEGORY && (
          <label>
            Nome da nova categoria
            <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} autoFocus />
          </label>
        )}

        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as ProductStatus)}>
            {(Object.keys(STATUS_LABEL) as ProductStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </label>

        <label>
          {product?.photo_path ? 'Trocar foto' : 'Foto'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <label>
          Observações
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </label>

        {product?.external_url && (
          <p className="small">
            <a href={product.external_url} target="_blank" rel="noreferrer">
              Abrir no painel admin ↗
            </a>
          </p>
        )}

        {error && <p className="error">{error}</p>}

        <div className="form-actions">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
          <a href="#/" className="secondary button-link">Cancelar</a>
          {editing && (
            <button type="button" className="danger" onClick={onDelete} disabled={busy}>
              Excluir
            </button>
          )}
        </div>
      </form>
    </main>
  );
}

function friendlyDbError(err: { code?: string; message: string }): Error {
  if (err.code === '23505' && err.message.includes('products_barcode_key')) {
    return new Error('Já existe um produto com esse código de barras.');
  }
  if (err.code === '23514' && err.message.includes('barcode')) {
    return new Error('Código de barras inválido — use só números (6 a 14 dígitos).');
  }
  return new Error(`Não foi possível salvar: ${err.message}`);
}
