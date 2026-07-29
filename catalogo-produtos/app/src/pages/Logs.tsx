import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Row {
  id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

function quando(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Atividade recente do catálogo: os produtos mexidos por último, com a
 * data e se foram criados ou editados. É o "log" que dá para montar com
 * o que o banco guarda hoje (created_at / updated_at). Auditoria completa
 * — quem alterou o quê — exige uma tabela de histórico; ver README.
 */
export function Logs() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('products')
      .select('id, name, status, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(200)
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setRows((data ?? []) as Row[]);
        setLoading(false);
      });
  }, []);

  return (
    <main className="content">
      <div className="page-head">
        <h1>Logs de atividade</h1>
        <span className="muted small">últimas 200 alterações</span>
      </div>

      {error && <p className="error">Erro ao carregar: {error}</p>}
      {loading && <p className="muted center-msg">Carregando…</p>}

      {!loading && rows.length > 0 && (
        <div className="logs">
          {rows.map((r) => {
            // "novo" se criado e atualizado praticamente no mesmo instante
            const novo = Math.abs(new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) < 2000;
            return (
              <a key={r.id} href={`#/p/${r.id}`} className="log-row">
                <span className={`log-tag ${novo ? 'log-new' : 'log-edit'}`}>
                  {novo ? 'novo' : 'editado'}
                </span>
                <span className="log-name">{r.name}</span>
                {r.status !== 'ativo' && <span className="badge badge-desativado">Desativado</span>}
                <span className="log-when muted small">{quando(r.updated_at)}</span>
              </a>
            );
          })}
        </div>
      )}
    </main>
  );
}
