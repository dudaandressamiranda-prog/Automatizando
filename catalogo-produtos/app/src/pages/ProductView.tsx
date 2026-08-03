import { useEffect, useState } from 'react';
import { Photo } from '../components/Photo';
import { supabase } from '../lib/supabase';
import { STATUS_LABEL, type Category, type Product } from '../lib/types';

interface Props {
  productId: string;
  voltar: () => void;
}

/**
 * Ficha do produto para quem não é admin.
 *
 * Todo card do catálogo aponta para a tela do produto, e a tela do produto
 * era o formulário de edição. Para o funcionário isso é uma armadilha: ele
 * abre, digita, salva — e leva um erro de permissão do banco, que agora
 * recusa a escrita. Melhor não oferecer o que não vai funcionar: aqui ele
 * vê os dados e o botão de voltar, e mais nada.
 */
export function ProductView({ productId, voltar }: Props) {
  const [produto, setProduto] = useState<Product | null>(null);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    async function load() {
      const { data, error } = await supabase.from('products').select('*').eq('id', productId).single();
      if (!vivo) return;
      if (error) {
        setErro(error.message);
        setCarregando(false);
        return;
      }
      const p = data as Product;
      setProduto(p);
      if (p.category_id) {
        const { data: c } = await supabase.from('categories').select('name').eq('id', p.category_id).single();
        if (vivo) setCategoria((c as Category | null)?.name ?? null);
      }
      setCarregando(false);
    }
    void load();
    return () => { vivo = false; };
  }, [productId]);

  if (carregando) return <main><p className="muted center-msg">Carregando…</p></main>;
  if (erro || !produto) {
    return (
      <main>
        <button type="button" className="back back-btn" onClick={voltar}>‹ Voltar</button>
        <p className="error">{erro ?? 'Produto não encontrado.'}</p>
      </main>
    );
  }

  return (
    <main>
      <button type="button" className="back back-btn" onClick={voltar}>‹ Voltar</button>

      <div className="card ficha">
        {produto.photo_path ? (
          <Photo path={produto.photo_path} alt={produto.name} />
        ) : produto.photo_source_url ? (
          <img src={produto.photo_source_url} alt={produto.name} className="photo" />
        ) : (
          <div className="ficha-sem-foto" aria-hidden>🐾</div>
        )}

        <h2>{produto.name}</h2>
        {produto.status !== 'ativo' && (
          <span className={`badge badge-${produto.status}`}>{STATUS_LABEL[produto.status]}</span>
        )}

        <dl className="ficha-dados">
          {produto.brand && (<><dt>Marca</dt><dd>{produto.brand}</dd></>)}
          {categoria && (<><dt>Categoria</dt><dd>{categoria}</dd></>)}
          {produto.barcode && (<><dt>Código de barras</dt><dd className="mono">{produto.barcode}</dd></>)}
          {produto.supplier && (<><dt>Fornecedor</dt><dd>{produto.supplier}</dd></>)}
          {produto.notes && (<><dt>Observações</dt><dd>{produto.notes}</dd></>)}
        </dl>

        <p className="muted small">
          Para corrigir algum dado deste produto, fale com o responsável pelo catálogo.
        </p>
      </div>
    </main>
  );
}
