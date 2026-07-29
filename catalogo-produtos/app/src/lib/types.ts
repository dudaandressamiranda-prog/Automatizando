export type ProductStatus = 'ativo' | 'desativado' | 'descontinuado';

export interface Category {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  name: string;
  barcode: string | null;
  brand: string | null;
  supplier: string | null;
  category_id: string | null;
  photo_path: string | null;
  photo_source_url: string | null;
  photo_updated_at: string | null;
  status: ProductStatus;
  source: string;
  external_id: string | null;
  external_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const STATUS_LABEL: Record<ProductStatus, string> = {
  ativo: 'Ativo',
  desativado: 'Desativado',
  descontinuado: 'Descontinuado',
};
