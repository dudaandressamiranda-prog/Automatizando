import { type FormEvent, useEffect, useState } from 'react';
import { Photo } from '../components/Photo';
import { eanSvg, isValidEan13, nextInternalEan } from '../lib/ean';
import { cleanBarcode, norm } from '../lib/normalize';
import { PRODUTO_RECENTE } from '../lib/recentes';
import { PHOTO_BUCKET, supabase } from '../lib/supabase';
import { STATUS_LABEL, type Category, type Product, type ProductStatus } from '../lib/types';

const NEW_CATEGORY = '__nova__';

interface Props {
  /** Devolve para a tela de origem — a categoria de onde o produto foi aberto. */
  voltar: () => void;
  productId?: string;
  initialBarcode?: string;
}

export function ProductForm({ voltar, productId, initialBarcode }: Props) {
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
  const [photoUrl, setPhotoUrl] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [gerando, setGerando] = useState(false);

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

  /**
   * Gera o próximo código interno livre. Consulta os que já existem para
   * continuar a contagem — dois produtos nunca recebem o mesmo número.
   */
  async function gerarInterno() {
    setGerando(true);
    setError(null);
    try {
      const usados: string[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error: err } = await supabase
          .from('products')
          .select('barcode')
          .like('barcode', '2%')
          .range(from, from + 999);
        if (err) throw err;
        usados.push(...(data ?? []).map((r) => r.barcode as string).filter(Boolean));
        if (!data || data.length < 1000) break;
      }
      setBarcode(nextInternalEan(usados));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGerando(false);
    }
  }

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

  async function uploadBlob(id: string, blob: Blob, mime: string): Promise<string> {
    const EXT: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/avif': 'avif',
    };
    const path = `products/${id}/${Date.now()}.${EXT[mime] ?? 'jpg'}`;
    const { error: upErr } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, blob, { contentType: mime });
    if (upErr) throw new Error(`A foto não subiu: ${upErr.message}`);
    return path;
  }

  async function savePhoto(id: string): Promise<void> {
    const link = photoUrl.trim();
    let path: string | null = null;

    if (photoFile) {
      path = await uploadBlob(id, photoFile, photoFile.type || 'image/jpeg');
    } else if (link) {
      // Tenta baixar a imagem do link para o bucket. Muitos sites bloqueiam
      // esse download pelo navegador (CORS) — nesse caso guardamos só o
      // link e a foto é exibida direto de lá.
      try {
        const resp = await fetch(link);
        if (resp.ok) {
          const blob = await resp.blob();
          if (['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(blob.type)) {
            path = await uploadBlob(id, blob, blob.type);
          }
        }
      } catch {
        // bloqueado pelo site de origem — segue só com o link
      }
    }

    const updates: Record<string, string> = {};
    if (path) {
      updates.photo_path = path;
      updates.photo_updated_at = new Date().toISOString();
    }
    if (link) updates.photo_source_url = link;
    if (Object.keys(updates).length === 0) return;

    const { error: updErr } = await supabase.from('products').update(updates).eq('id', id);
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
      // Mexeu na situação aqui na tela? A decisão passa a ser sua: os
      // importadores respeitam status_manual e não a desfazem na próxima
      // planilha. Só marca quando o status realmente mudou, para salvar
      // uma correção de nome não travar o produto sem querer.
      const mudouStatus = !editing || (product != null && status !== product.status);
      const fields = {
        name: cleanName,
        barcode: barcodeValue,
        brand: brand.trim() || null,
        supplier: supplier.trim() || null,
        category_id: catId,
        status,
        notes: notes.trim() || null,
        ...(mudouStatus ? { status_manual: true } : {}),
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

      await savePhoto(id!);
      // deixa o rastro para a lista rolar até este produto e destacá-lo
      sessionStorage.setItem(PRODUTO_RECENTE, id!);
      voltar();
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
    voltar();
  }

  if (!loaded) return <main><p className="muted">Carregando…</p></main>;

  return (
    <main>
      <button
        type="button"
        className="back back-btn"
        onClick={voltar}
      >
        ‹ Voltar
      </button>
      <form onSubmit={onSubmit} className="card form">
        <h2>{editing ? 'Editar produto' : 'Novo produto'}</h2>

        {product?.photo_path ? (
          <Photo path={product.photo_path} alt={product.name} />
        ) : product?.photo_source_url ? (
          <img src={product.photo_source_url} alt={product.name} className="photo" />
        ) : null}

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
        <div className="ean-tools">
          <button type="button" className="secondary" onClick={gerarInterno} disabled={gerando}>
            {gerando ? 'Gerando…' : '⊕ Gerar código interno'}
          </button>
          <span className="muted tiny">
            Para produto sem EAN do fornecedor, ou quando o fornecedor repete o
            mesmo código em variações diferentes. Usa a faixa 2, reservada para
            uso interno — não colide com código de fabricante.
          </span>
        </div>
        {isValidEan13(barcode.trim()) && (
          <div
            className="ean-preview"
            dangerouslySetInnerHTML={{ __html: eanSvg(barcode.trim(), { modulo: 2, altura: 48 }) }}
          />
        )}

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
          {product?.photo_path || product?.photo_source_url ? 'Trocar foto' : 'Foto'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <label>
          …ou cole o link da imagem
          <input
            type="url"
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            placeholder="https://…"
            disabled={Boolean(photoFile)}
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
          <button type="button" className="secondary" onClick={voltar} disabled={busy}>
            Cancelar
          </button>
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
