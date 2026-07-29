import { useEffect, useState } from 'react';
import { PHOTO_BUCKET, supabase } from '../lib/supabase';

interface Props {
  path: string;
  alt: string;
}

/** Foto do bucket privado — o app pede uma URL assinada (válida por 1h). */
export function Photo({ path, alt }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data) setFailed(true);
        else setUrl(data.signedUrl);
      });
    return () => {
      alive = false;
    };
  }, [path]);

  if (failed) return <div className="photo-placeholder">foto indisponível</div>;
  if (!url) return <div className="photo-placeholder">carregando…</div>;
  return <img src={url} alt={alt} className="photo" />;
}
