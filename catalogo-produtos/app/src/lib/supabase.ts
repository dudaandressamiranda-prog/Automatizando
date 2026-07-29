import { createClient } from '@supabase/supabase-js';

/**
 * Copiar/colar (principalmente no celular) costuma trazer caracteres
 * invisíveis (espaço zero-width, quebra de linha, "…"), que quebram o
 * header da requisição. Ficamos só com ASCII imprimível.
 */
function clean(v: string | undefined): string | undefined {
  const out = v?.replace(/[^\x21-\x7e]/g, '');
  return out || undefined;
}

const url = clean(import.meta.env.VITE_SUPABASE_URL as string | undefined);
const anonKey = clean(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

if (!url || !anonKey) {
  throw new Error(
    'Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env (veja .env.example).',
  );
}

export const supabase = createClient(url, anonKey);

export const PHOTO_BUCKET = 'product-photos';
