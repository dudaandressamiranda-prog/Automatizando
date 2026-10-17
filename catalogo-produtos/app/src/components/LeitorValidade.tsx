import { useCallback, useState } from 'react';
import { gtinParaEan, lerGs1 } from '../lib/loteParser';
import { cleanBarcode } from '../lib/normalize';
import { buscarPorCodigo, type NovaValidade, type ProdutoDoCodigo } from '../lib/validades';
import { LeitorCodigoBarras } from './LeitorCodigoBarras';
import { LeitorLoteValidade } from './LeitorLoteValidade';

interface Props {
  onFechar: () => void;
  /** Grava o registro. Devolve false se a pessoa desistiu (ex.: repetido). */
  onSalvar: (v: NovaValidade) => Promise<boolean>;
}

/*
 * Conferência de lote e validade em DUAS telas separadas, cada uma com sua
 * própria câmera: primeiro só o código de barras; achado o produto, abre uma
 * segunda tela — com uma câmera nova — só para o lote e a validade (OCR).
 *
 * Antes era uma câmera só, tentando as duas coisas ao mesmo tempo (a imagem
 * encolhia no meio pra abrir o OCR): isso atrasava e o foco nunca se
 * ajustava direito para o texto pequeno do lote. Separando em telas e
 * câmeras diferentes, cada etapa foca só no que precisa, e trocar de câmera
 * entre uma etapa e outra também ajuda o celular a focar de novo.
 */

type Fase = 'codigo' | 'buscando' | 'lote';

export function LeitorValidade({ onFechar, onSalvar }: Props) {
  const [fase, setFase] = useState<Fase>('codigo');
  const [codigo, setCodigo] = useState('');
  const [produto, setProduto] = useState<ProdutoDoCodigo | null>(null);
  const [nome, setNome] = useState('');
  const [loteInicial, setLoteInicial] = useState('');
  const [validadeInicial, setValidadeInicial] = useState('');

  const aoLerCodigo = useCallback(async (bruto: string) => {
    const gs1 = lerGs1(bruto);
    const cod = gs1 ? gtinParaEan(gs1.gtin) : cleanBarcode(bruto) ?? bruto.trim();
    if (!cod) return;
    setFase('buscando');
    let achado: ProdutoDoCodigo | null = null;
    try {
      achado = await buscarPorCodigo(cod);
    } catch {
      /* sem conexão: segue, a pessoa digita o nome */
    }
    setCodigo(cod);
    setProduto(achado);
    setNome(achado?.name ?? '');
    // DataMatrix de medicamento já traz lote e validade — nem precisa de OCR
    setLoteInicial(gs1?.lote ?? '');
    setValidadeInicial(gs1?.validade?.texto ?? '');
    setFase('lote');
  }, []);

  function aoVoltarParaCodigo() {
    setFase('codigo');
  }

  if (fase === 'buscando') {
    return (
      <div className="lv-overlay lv-codigo">
        <div className="lv-camera"><p className="lv-dica">Procurando o produto…</p></div>
      </div>
    );
  }

  if (fase === 'lote') {
    return (
      <LeitorLoteValidade
        key={codigo}
        codigo={codigo}
        produto={produto}
        nomeInicial={nome}
        loteInicial={loteInicial}
        validadeInicial={validadeInicial}
        onSalvar={onSalvar}
        onOutroProduto={aoVoltarParaCodigo}
        onFechar={onFechar}
      />
    );
  }

  return <LeitorCodigoBarras onLido={(c) => void aoLerCodigo(c)} onFechar={onFechar} />;
}
