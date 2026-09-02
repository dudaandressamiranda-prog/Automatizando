// app.js — Controle de Horas Extras
// Calendário para lançar horas extras dia a dia (com feriados nacionais
// e de Contagem/MG já marcados) e exportar um relatório em PDF para a
// contabilidade.

(function () {
  'use strict';

  const CHAVE_ENTRIES = 'horasExtras.entries.v1';
  const CHAVE_SETTINGS = 'horasExtras.settings.v1';

  const MESES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];
  const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const TIPOS_PADRAO = ['50%', '100%', 'Banco de horas', 'Sobreaviso'];

  // ---------- Estado ----------

  let dataVisivel = new Date(); // qualquer dia dentro do mês exibido
  let entries = carregarEntries();
  let settings = carregarSettings();
  let dataKeySelecionada = null; // dia aberto no modal de lançamento

  // ---------- Persistência ----------

  function carregarEntries() {
    try {
      const bruto = localStorage.getItem(CHAVE_ENTRIES);
      return bruto ? JSON.parse(bruto) : {};
    } catch (e) {
      return {};
    }
  }

  function salvarEntries() {
    localStorage.setItem(CHAVE_ENTRIES, JSON.stringify(entries));
  }

  function carregarSettings() {
    try {
      const bruto = localStorage.getItem(CHAVE_SETTINGS);
      return bruto ? JSON.parse(bruto) : { nome: '' };
    } catch (e) {
      return { nome: '' };
    }
  }

  function salvarSettings() {
    localStorage.setItem(CHAVE_SETTINGS, JSON.stringify(settings));
  }

  // ---------- Helpers de data/hora ----------

  function formatarChaveData(data) {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }

  function dataDaChave(chave) {
    const [ano, mes, dia] = chave.split('-').map(Number);
    return new Date(ano, mes - 1, dia);
  }

  function ehFimDeSemana(data) {
    const d = data.getDay();
    return d === 0 || d === 6;
  }

  function horasParaDecimal(texto) {
    if (!texto) return 0;
    texto = String(texto).trim().replace(',', '.');
    if (texto.includes(':')) {
      const [h, m] = texto.split(':').map(Number);
      return (h || 0) + (m || 0) / 60;
    }
    const n = parseFloat(texto);
    return isNaN(n) ? 0 : n;
  }

  function decimalParaHoras(decimal) {
    decimal = Number(decimal) || 0;
    const sinal = decimal < 0 ? '-' : '';
    decimal = Math.abs(decimal);
    const h = Math.floor(decimal + 1e-9);
    const m = Math.round((decimal - h) * 60);
    return `${sinal}${h}:${String(m).padStart(2, '0')}`;
  }

  // ---------- Referências de elementos ----------

  const el = {
    mesAtualLabel: document.getElementById('mesAtualLabel'),
    btnMesAnterior: document.getElementById('btnMesAnterior'),
    btnMesSeguinte: document.getElementById('btnMesSeguinte'),
    btnHoje: document.getElementById('btnHoje'),
    weekdayRow: document.getElementById('weekdayRow'),
    calendarGrid: document.getElementById('calendarGrid'),
    resumoLista: document.getElementById('resumoLista'),
    resumoTotal: document.getElementById('resumoTotal'),
    btnExportar: document.getElementById('btnExportar'),

    btnConfig: document.getElementById('btnConfig'),

    dayModal: document.getElementById('dayModal'),
    dayForm: document.getElementById('dayForm'),
    modalDataTitulo: document.getElementById('modalDataTitulo'),
    modalHolidayNote: document.getElementById('modalHolidayNote'),
    fTipo: document.getElementById('fTipo'),
    fTipoOutroWrap: document.getElementById('fTipoOutroWrap'),
    fTipoOutro: document.getElementById('fTipoOutro'),
    fInicio: document.getElementById('fInicio'),
    fFim: document.getElementById('fFim'),
    fHoras: document.getElementById('fHoras'),
    fObs: document.getElementById('fObs'),
    btnExcluir: document.getElementById('btnExcluir'),
    btnCancelarDia: document.getElementById('btnCancelarDia'),

    exportModal: document.getElementById('exportModal'),
    exportForm: document.getElementById('exportForm'),
    eTitulo: document.getElementById('eTitulo'),
    eNome: document.getElementById('eNome'),
    eTipoFiltro: document.getElementById('eTipoFiltro'),
    btnCancelarExport: document.getElementById('btnCancelarExport'),

    pdfReadyModal: document.getElementById('pdfReadyModal'),
    pdfReadyNome: document.getElementById('pdfReadyNome'),
    btnCompartilhar: document.getElementById('btnCompartilhar'),
    btnBaixarPdf: document.getElementById('btnBaixarPdf'),
    btnVerPdf: document.getElementById('btnVerPdf'),
    btnFecharPdfReady: document.getElementById('btnFecharPdfReady'),

    settingsModal: document.getElementById('settingsModal'),
    settingsForm: document.getElementById('settingsForm'),
    sNome: document.getElementById('sNome'),
    customHolidayList: document.getElementById('customHolidayList'),
    chData: document.getElementById('chData'),
    chNome: document.getElementById('chNome'),
    chAdd: document.getElementById('chAdd'),
  };

  // ---------- Cabeçalho dos dias da semana ----------

  DIAS_SEMANA.forEach((d) => {
    const span = document.createElement('div');
    span.textContent = d;
    el.weekdayRow.appendChild(span);
  });

  // ---------- Renderização do calendário ----------

  function renderCalendario() {
    const ano = dataVisivel.getFullYear();
    const mes = dataVisivel.getMonth();
    el.mesAtualLabel.textContent = `${MESES[mes]} de ${ano}`;

    const feriados = obterFeriados(ano);
    const hoje = new Date();
    const hojeChave = formatarChaveData(hoje);

    const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
    const totalDiasMes = new Date(ano, mes + 1, 0).getDate();

    el.calendarGrid.innerHTML = '';

    const totalCelulas = Math.ceil((primeiroDiaSemana + totalDiasMes) / 7) * 7;

    for (let i = 0; i < totalCelulas; i++) {
      const numeroDia = i - primeiroDiaSemana + 1;
      const celula = document.createElement('button');
      celula.type = 'button';
      celula.className = 'day-cell';

      if (numeroDia < 1 || numeroDia > totalDiasMes) {
        celula.classList.add('outside');
        celula.tabIndex = -1;
        el.calendarGrid.appendChild(celula);
        continue;
      }

      const dataCelula = new Date(ano, mes, numeroDia);
      const chave = formatarChaveData(dataCelula);
      const feriado = feriados.get(chave);
      const entry = entries[chave];

      if (ehFimDeSemana(dataCelula)) celula.classList.add('weekend');
      if (feriado) celula.classList.add(`holiday-${feriado.tipo}`);
      if (chave === hojeChave) celula.classList.add('today');
      if (entry) celula.classList.add('has-entry');

      let title = dataCelula.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
      if (feriado) title += ` — ${feriado.nome}`;

      celula.title = title;
      celula.dataset.chave = chave;

      const numeroSpan = document.createElement('span');
      numeroSpan.className = 'day-number';
      numeroSpan.textContent = String(numeroDia);
      celula.appendChild(numeroSpan);

      if (feriado) {
        const tag = document.createElement('span');
        tag.className = 'holiday-tag';
        tag.textContent = feriado.nome;
        celula.appendChild(tag);
      }

      if (entry) {
        const badge = document.createElement('span');
        badge.className = 'entry-badge';
        badge.textContent = decimalParaHoras(entry.horas) + 'h';
        celula.appendChild(badge);
      }

      celula.addEventListener('click', () => abrirModalDia(chave));
      el.calendarGrid.appendChild(celula);
    }

    renderResumo();
  }

  // ---------- Resumo do mês ----------

  function entriesDoMesAtual() {
    const ano = dataVisivel.getFullYear();
    const mes = dataVisivel.getMonth();
    const prefixo = `${ano}-${String(mes + 1).padStart(2, '0')}-`;
    return Object.keys(entries)
      .filter((chave) => chave.startsWith(prefixo))
      .sort()
      .map((chave) => ({ chave, ...entries[chave] }));
  }

  function renderResumo() {
    const lista = entriesDoMesAtual();
    el.resumoLista.innerHTML = '';

    if (lista.length === 0) {
      const vazio = document.createElement('p');
      vazio.className = 'resumo-vazio';
      vazio.textContent = 'Nenhuma hora extra lançada neste mês. Toque em um dia no calendário para adicionar.';
      el.resumoLista.appendChild(vazio);
      el.btnExportar.disabled = true;
    } else {
      lista.forEach((item) => {
        const data = dataDaChave(item.chave);
        const linha = document.createElement('div');
        linha.className = 'resumo-item';

        const dataSpan = document.createElement('span');
        dataSpan.className = 'resumo-item-data';
        dataSpan.textContent = `${DIAS_SEMANA[data.getDay()]} ${data.toLocaleDateString('pt-BR')}`;

        const infoSpan = document.createElement('span');
        infoSpan.className = 'resumo-item-info';
        const horario = item.inicio && item.fim ? `${item.inicio}–${item.fim} · ` : '';
        infoSpan.textContent = `${horario}${item.tipo}`;

        const horasSpan = document.createElement('span');
        horasSpan.className = 'resumo-item-horas';
        horasSpan.textContent = `${decimalParaHoras(item.horas)}h`;

        linha.append(dataSpan, infoSpan, horasSpan);
        linha.addEventListener('click', () => abrirModalDia(item.chave));
        el.resumoLista.appendChild(linha);
      });
      el.btnExportar.disabled = false;
    }

    const total = lista.reduce((soma, item) => soma + (Number(item.horas) || 0), 0);
    el.resumoTotal.textContent = `${decimalParaHoras(total)} h`;
  }

  // ---------- Navegação de mês ----------

  el.btnMesAnterior.addEventListener('click', () => {
    dataVisivel = new Date(dataVisivel.getFullYear(), dataVisivel.getMonth() - 1, 1);
    renderCalendario();
  });

  el.btnMesSeguinte.addEventListener('click', () => {
    dataVisivel = new Date(dataVisivel.getFullYear(), dataVisivel.getMonth() + 1, 1);
    renderCalendario();
  });

  el.btnHoje.addEventListener('click', () => {
    dataVisivel = new Date();
    renderCalendario();
  });

  // ---------- Modal de lançamento diário ----------

  function abrirModalDia(chave) {
    dataKeySelecionada = chave;
    const data = dataDaChave(chave);
    const ano = data.getFullYear();
    const feriado = obterFeriados(ano).get(chave);
    const entry = entries[chave];

    el.modalDataTitulo.textContent = data.toLocaleDateString('pt-BR', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    });

    if (feriado) {
      el.modalHolidayNote.textContent = `📅 ${feriado.nome}`;
      el.modalHolidayNote.classList.remove('hidden');
    } else {
      el.modalHolidayNote.classList.add('hidden');
    }

    if (entry) {
      el.fTipo.value = TIPOS_PADRAO.includes(entry.tipo) ? entry.tipo : 'outro';
      el.fTipoOutro.value = TIPOS_PADRAO.includes(entry.tipo) ? '' : entry.tipo;
      el.fInicio.value = entry.inicio || '';
      el.fFim.value = entry.fim || '';
      el.fHoras.value = decimalParaHoras(entry.horas);
      el.fObs.value = entry.obs || '';
      el.btnExcluir.classList.remove('hidden');
    } else {
      const eDiaEspecial = ehFimDeSemana(data) || !!feriado;
      el.fTipo.value = eDiaEspecial ? '100%' : '50%';
      el.fTipoOutro.value = '';
      el.fInicio.value = '';
      el.fFim.value = '';
      el.fHoras.value = '';
      el.fObs.value = '';
      el.btnExcluir.classList.add('hidden');
    }

    el.fTipoOutroWrap.classList.toggle('hidden', el.fTipo.value !== 'outro');
    el.dayModal.showModal();
  }

  el.fTipo.addEventListener('change', () => {
    el.fTipoOutroWrap.classList.toggle('hidden', el.fTipo.value !== 'outro');
  });

  function calcularHorasAutomatico() {
    const ini = el.fInicio.value;
    const fim = el.fFim.value;
    if (!ini || !fim) return;
    const [ih, im] = ini.split(':').map(Number);
    const [fh, fm] = fim.split(':').map(Number);
    let minutos = (fh * 60 + fm) - (ih * 60 + im);
    if (minutos <= 0) minutos += 24 * 60; // atravessou a meia-noite
    el.fHoras.value = decimalParaHoras(minutos / 60);
  }

  el.fInicio.addEventListener('change', calcularHorasAutomatico);
  el.fFim.addEventListener('change', calcularHorasAutomatico);

  el.dayForm.addEventListener('submit', () => {
    const tipo = el.fTipo.value === 'outro'
      ? (el.fTipoOutro.value.trim() || 'Outro')
      : el.fTipo.value;
    const horas = horasParaDecimal(el.fHoras.value);

    if (!horas) {
      // dialog fecha de qualquer forma (method="dialog"); reabrir se inválido
      requestAnimationFrame(() => el.dayModal.showModal());
      alert('Informe o total de horas (ex: 2:30) ou o horário de início e fim.');
      return;
    }

    entries[dataKeySelecionada] = {
      tipo,
      inicio: el.fInicio.value || '',
      fim: el.fFim.value || '',
      horas,
      obs: el.fObs.value.trim(),
    };
    salvarEntries();
    renderCalendario();
  });

  el.btnExcluir.addEventListener('click', () => {
    if (dataKeySelecionada && confirm('Excluir o lançamento deste dia?')) {
      delete entries[dataKeySelecionada];
      salvarEntries();
      el.dayModal.close();
      renderCalendario();
    }
  });

  el.btnCancelarDia.addEventListener('click', () => el.dayModal.close());

  // ---------- Exportação em PDF ----------

  el.btnExportar.addEventListener('click', () => {
    const lista = entriesDoMesAtual();
    const tiposUsados = Array.from(new Set(lista.map((i) => i.tipo)));
    el.eTipoFiltro.innerHTML = '<option value="todos">Todos os tipos</option>';
    tiposUsados.forEach((tipo) => {
      const opt = document.createElement('option');
      opt.value = tipo;
      opt.textContent = tipo;
      el.eTipoFiltro.appendChild(opt);
    });

    const nomeMes = MESES[dataVisivel.getMonth()];
    const ano = dataVisivel.getFullYear();
    el.eTitulo.value = `Horas Extras - ${nomeMes}/${ano}`;
    el.eNome.value = settings.nome || '';

    el.exportModal.showModal();
  });

  el.btnCancelarExport.addEventListener('click', () => el.exportModal.close());

  // Ações da tela "PDF pronto".
  el.btnCompartilhar.addEventListener('click', async () => {
    if (!pdfAtual || !pdfAtual.file) return;
    try {
      await navigator.share({
        files: [pdfAtual.file],
        title: pdfAtual.nomeArquivo,
        text: 'Relatório de horas extras.',
      });
    } catch (e) {
      // usuário cancelou ou não suportado — ignora
    }
  });

  el.btnBaixarPdf.addEventListener('click', () => {
    if (!pdfAtual) return;
    const a = document.createElement('a');
    a.href = pdfAtual.url;
    a.download = pdfAtual.nomeArquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  el.btnVerPdf.addEventListener('click', () => {
    if (!pdfAtual) return;
    window.open(pdfAtual.url, '_blank');
  });

  el.btnFecharPdfReady.addEventListener('click', () => el.pdfReadyModal.close());

  el.exportForm.addEventListener('submit', () => {
    settings.nome = el.eNome.value.trim();
    salvarSettings();
    gerarPDF({
      titulo: el.eTitulo.value.trim(),
      nome: el.eNome.value.trim(),
      tipoFiltro: el.eTipoFiltro.value,
    });
  });

  function gerarPDF({ titulo, nome, tipoFiltro }) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });

    const lista = entriesDoMesAtual()
      .filter((item) => tipoFiltro === 'todos' || item.tipo === tipoFiltro);

    doc.setFontSize(16);
    doc.text(titulo || 'Horas Extras', 40, 48);

    doc.setFontSize(10);
    doc.setTextColor(90);
    let y = 68;
    if (nome) {
      doc.text(`Colaborador(a): ${nome}`, 40, y);
      y += 16;
    }
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 40, y);
    y += 14;

    const linhas = lista.map((item) => {
      const data = dataDaChave(item.chave);
      return [
        data.toLocaleDateString('pt-BR'),
        DIAS_SEMANA[data.getDay()],
        item.inicio && item.fim ? `${item.inicio} às ${item.fim}` : '—',
        `${decimalParaHoras(item.horas)}h`,
        item.tipo,
        item.obs || '',
      ];
    });

    const totalHoras = lista.reduce((soma, item) => soma + (Number(item.horas) || 0), 0);

    doc.autoTable({
      startY: y + 8,
      head: [['Data', 'Dia', 'Horário', 'Horas', 'Tipo', 'Observação']],
      body: linhas,
      foot: [['', '', '', `${decimalParaHoras(totalHoras)}h`, 'Total', '']],
      styles: { fontSize: 9, cellPadding: 6 },
      headStyles: { fillColor: [31, 41, 55] },
      footStyles: { fillColor: [31, 41, 55], fontStyle: 'bold', textColor: 255 },
      columnStyles: { 5: { cellWidth: 130 } },
    });

    const nomeArquivo = `horas-extras-${dataVisivel.getFullYear()}-${String(dataVisivel.getMonth() + 1).padStart(2, '0')}.pdf`;
    apresentarPDF(doc, nomeArquivo);
  }

  // Guarda o PDF gerado para os botões de compartilhar/baixar/ver.
  let pdfAtual = null;

  // No celular, downloads automáticos costumam ser bloqueados. Em vez de
  // baixar direto, mostramos uma tela com opções: compartilhar (abre a tela
  // nativa do celular, para enviar por e-mail/WhatsApp), baixar e ver.
  function apresentarPDF(doc, nomeArquivo) {
    if (pdfAtual && pdfAtual.url) URL.revokeObjectURL(pdfAtual.url);

    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    let file = null;
    try {
      file = new File([blob], nomeArquivo, { type: 'application/pdf' });
    } catch (e) {
      file = null;
    }
    pdfAtual = { blob, url, file, nomeArquivo };

    const podeCompartilhar = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
    el.btnCompartilhar.classList.toggle('hidden', !podeCompartilhar);

    el.pdfReadyNome.textContent = nomeArquivo;
    el.pdfReadyModal.showModal();
  }

  // ---------- Configurações ----------

  el.btnConfig.addEventListener('click', () => {
    el.sNome.value = settings.nome || '';
    renderCustomHolidayList();
    el.settingsModal.showModal();
  });

  el.settingsForm.addEventListener('submit', () => {
    settings.nome = el.sNome.value.trim();
    salvarSettings();
  });

  function renderCustomHolidayList() {
    const lista = carregarFeriadosPersonalizados();
    el.customHolidayList.innerHTML = '';
    if (lista.length === 0) {
      const vazio = document.createElement('p');
      vazio.className = 'hint';
      vazio.textContent = 'Nenhum feriado personalizado cadastrado.';
      el.customHolidayList.appendChild(vazio);
      return;
    }
    lista.forEach((fh, index) => {
      const item = document.createElement('div');
      item.className = 'custom-holiday-item';
      const label = document.createElement('span');
      label.textContent = `${fh.data} — ${fh.nome}`;
      const btnRemover = document.createElement('button');
      btnRemover.type = 'button';
      btnRemover.textContent = '✕';
      btnRemover.addEventListener('click', () => {
        const atual = carregarFeriadosPersonalizados();
        atual.splice(index, 1);
        salvarFeriadosPersonalizados(atual);
        renderCustomHolidayList();
        renderCalendario();
      });
      item.append(label, btnRemover);
      el.customHolidayList.appendChild(item);
    });
  }

  el.chAdd.addEventListener('click', () => {
    const data = el.chData.value; // AAAA-MM-DD
    const nome = el.chNome.value.trim();
    if (!data || !nome) {
      alert('Informe a data e o nome do feriado.');
      return;
    }
    const lista = carregarFeriadosPersonalizados();
    lista.push({ data, nome });
    salvarFeriadosPersonalizados(lista);
    el.chData.value = '';
    el.chNome.value = '';
    renderCustomHolidayList();
    renderCalendario();
  });

  // ---------- Início ----------

  renderCalendario();
})();
