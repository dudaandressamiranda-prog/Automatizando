import { useState } from 'react';
import { cleanBarcode } from '../lib/normalize';
import { supabase } from '../lib/supabase';
import {
  LOTE_TINY, aplicarNoCatalogo, consultarTiny, type Categoria, type ConsultaTiny, type Sincronizado,
} from '../lib/tiny';

type Linha = {
  ean: string;
  tipo: 'ok' | 'aviso' | 'erro';
  titulo: string;
  detalhe?: string;
  produtoId?: string;
};

/** Texto de uma linha do resultado, a partir da consulta e do que foi gravado. */
function descrever(c: ConsultaTiny, s?: Sincronizado): Linha {
  if (c.status === 'nao_encontrado') return { ean: c.ean, tipo: 'erro', titulo: 'Não encontrado no Tiny' };
  if (c.status === 'kit') {
    return { ean: c.ean, tipo: 'aviso', titulo: 'Kit — não entra no catálogo', detalhe: c.nome };
  }
  if (c.status === 'erro') return { ean: c.ean, tipo: 'erro', titulo: 'Erro', detalhe: c.erro };

  const nome = c.produto.nome;
  const inativo = c.produto.situacao === 'I' ? ' Inativo no Tiny (não vende online).' : '';
  if (!s) return { ean: c.ean, tipo: 'erro', titulo: 'Não gravado', detalhe: nome };
  switch (s.acao) {
    case 'criado':
      return s.ativo
        ? { ean: c.ean, tipo: 'ok', titulo: 'Cadastrado (ativo)', detalhe: nome + '.' + inativo, produtoId: s.id }
        : {
            ean: c.ean, tipo: 'aviso', titulo: 'Cadastrado desativado — sem foto no Tiny',
            detalhe: `${nome}. Complete a foto em "A completar".${inativo}`, produtoId: s.id,
          };
    case 'atualizado':
      return { ean: c.ean, tipo: 'ok', titulo: `Atualizado: ${s.mudancas.join(', ')}`, detalhe: nome, produtoId: s.id };
    case 'igual':
      return { ean: c.ean, tipo: 'ok', titulo: 'Já estava igual ao Tiny', detalhe: nome, produtoId: s.id };
    case 'conflito':
      return {
        ean: c.ean, tipo: 'aviso', titulo: 'Já existe no catálogo com outro código',
        detalhe: `${nome} está cadastrado com ${s.barcode}. Nada foi alterado — confira à mão.`, produtoId: s.id,
      };
  }
}

export function Sincronizar() {
  const [texto, setTexto] = useState('');
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [rodando, setRodando] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const tokens = texto.split(/[\s,;]+/).filter(Boolean);
  const eans = [...new Set(tokens.map((t) => cleanBarcode(t)).filter((e): e is string => Boolean(e)))];
  const invalidos = tokens.filter((t) => !cleanBarcode(t));

  async function sincronizar() {
    setRodando(true);
    setErro(null);
    setLinhas([]);
    try {
      const { data: cats, error } = await supabase.from('categories').select('id, name');
      if (error) throw error;
      const categorias = (cats ?? []) as Categoria[];

      for (let i = 0; i < eans.length; i += LOTE_TINY) {
        setProgresso(`Consultando o Tiny… ${Math.min(i + LOTE_TINY, eans.length)} de ${eans.length}`);
        const consultas = await consultarTiny(eans.slice(i, i + LOTE_TINY));
        for (const c of consultas) {
          let linha: Linha;
          if (c.status === 'ok') {
            try {
              linha = descrever(c, await aplicarNoCatalogo(c.ean, c.produto, categorias));
            } catch (e) {
              const msg = e instanceof Error ? e.message : (e as { message?: string }).message ?? String(e);
              linha = { ean: c.ean, tipo: 'erro', titulo: 'Erro ao gravar no catálogo', detalhe: msg };
            }
          } else {
            linha = descrever(c);
          }
          setLinhas((ls) => [...ls, linha]);
        }
      }
      setTexto('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setRodando(false);
      setProgresso(null);
    }
  }

  return (
    <main className="content">
      <div className="page-head">
        <a href="#/" className="back">‹ Início</a>
        <h1>🔄 Sincronizar com o Tiny</h1>
      </div>
      <p className="muted review-hint">
        Cole os códigos de barras (um por linha) de produtos que já estão no Tiny
        e toque em <strong>Sincronizar</strong>. Produto novo entra no catálogo —
        ativo se tiver foto no Tiny, desativado se não tiver. Produto que já existe
        tem nome, marca e foto atualizados; a situação (ativo/desativado) não muda.
      </p>

      <textarea
        className="sinc-eans"
        rows={6}
        inputMode="numeric"
        placeholder={'7891234567895\n7897348208105'}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        disabled={rodando}
      />
      {invalidos.length > 0 && (
        <p className="tiny error">
          Ignorados (não parecem código de barras): {invalidos.slice(0, 5).join(', ')}
          {invalidos.length > 5 ? '…' : ''}
        </p>
      )}
      <button className="primary sinc-botao" onClick={sincronizar} disabled={rodando || eans.length === 0}>
        {rodando
          ? 'Sincronizando…'
          : `Sincronizar${eans.length ? ` ${eans.length} produto${eans.length === 1 ? '' : 's'}` : ''}`}
      </button>
      {progresso && <p className="muted small">{progresso}</p>}
      {erro && <p className="error">{erro}</p>}

      {linhas.length > 0 && (
        <ul className="sinc-resultados">
          {linhas.map((l) => (
            <li key={l.ean} className={`sinc-res sinc-${l.tipo}`}>
              <span className="mono tiny muted">{l.ean}</span>
              <strong>{l.titulo}</strong>
              {l.detalhe && <span className="small">{l.detalhe}</span>}
              {l.produtoId && <a href={`#/p/${l.produtoId}`} className="small">Abrir produto ›</a>}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
