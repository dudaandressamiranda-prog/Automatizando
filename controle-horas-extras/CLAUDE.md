# Controle de Horas Extras — contexto do projeto (leia antes de tudo)

App pessoal da **Andressa** (duda.andressa.miranda@gmail.com) para registrar as **horas extras**
dela num calendário e exportar um **PDF** para enviar à contabilidade. Substitui a planilha de Excel
que ela refazia todo mês (tinha que olhar o calendário, achar fins de semana e feriados e apagar
linhas). Ela mora em **Contagem - MG**. Fala pt-BR, quer explicações simples e passo a passo, usa
muito o celular.

## Regras de trabalho (da Andressa)
- Para ações que mexem no ar (publicar, juntar branches, tornar repositório público), confirmar em
  texto antes e dizer exatamente o que vai acontecer. Ela já clicou numa opção de AskUserQuestion sem querer.
- Economizar uso: um teste por mudança; nada de agentes em paralelo sem pedir.
- Ao fim de cada tarefa: commit + push. Atualizar este CLAUDE.md e, no Drive/Obsidian (Segundo Cérebro),
  a pasta `Projetos › 10 - Controle de Horas Extras` (resumo.md amigável + CLAUDE.md técnico).

## Onde está o código (25/11/2026)
- Repositório **`dudaandressamiranda-prog/Automatizando`** (TORNADO PÚBLICO em 25/11, com ok dela, para o
  GitHub Pages grátis funcionar), pasta **`controle-horas-extras/`**.
  ATENÇÃO: a raiz desse repositório tem OUTROS projetos — `app/` (Portão de Casa, controle do portão por
  MQTT), `catalogo-produtos/`, `firmware/`. Não mexer neles sem pedir.
- Branch padrão do repositório: **`claude/smart-gate-mobile-control-axjq9x`** (NÃO é `main`). Branch de
  trabalho desta funcionalidade: `claude/overtime-tracking-app-4awwz3`. Trabalhar no branch, abrir PR e
  juntar no padrão (o deploy só roda no padrão).
- **No ar:** https://dudaandressamiranda-prog.github.io/Automatizando/ (um `index.html` na raiz do repo
  redireciona para `controle-horas-extras/`). O endereço do domínio sozinho dá 404; precisa do `/Automatizando/`.
- **Publicação:** GitHub Actions. Workflow `.github/workflows/deploy-pages.yml` publica a RAIZ do repositório
  no GitHub Pages a cada push no branch padrão. A origem do Pages = **GitHub Actions** (a Andressa ligou à mão
  em Settings → Pages em 25/11; o `enablement: true` do workflow não tinha permissão para ligar sozinho, e o
  Pages grátis exige repositório público).

## Tecnologia
- HTML/CSS/JS puro, SEM build, SEM backend. Os dados ficam só no `localStorage` do navegador.
- PDF: **jsPDF 2.5.1 + jspdf-autotable 3.8.2** (via CDN cdnjs).
- PWA (instalável): `manifest.json` + ícones PNG (relógio verde) em `icons/` (192, 512, apple-touch 180).
  Os ícones foram gerados por um script Python puro (sem libs); `display: standalone`.

## O que o app faz
- **Calendário mensal**: toca num dia e lança a hora extra. Fins de semana e feriados já vêm marcados.
  - Ao abrir um dia NOVO, já vem preenchido: **tipo 100%**, **início 18:00**, **fim 20:00** (total 2:00
    calculado sozinho). É só salvar; se for diferente, edita. (Padrões a pedido dela, para agilizar.)
  - Campos: tipo (50%/100%/Banco de horas/Sobreaviso/outro), início, fim (total calculado), observação.
- **Feriados** (`holidays.js`):
  - Nacionais, calculados ano a ano, inclusive os móveis (Sexta-feira Santa, Corpus Christi) via cálculo da Páscoa.
  - Municipais de **Contagem/MG**: Jubileu de Nossa Senhora das Dores (móvel, sexta anterior ao Domingo de
    Ramos = Páscoa − 9 dias; Lei Municipal nº 3.484/2001) e Nossa Senhora da Conceição (8/12). Aniversário de
    Contagem (30/08) entra como **ponto facultativo**.
  - Feriados personalizados: em Configurações (⚙), guardados no localStorage.
- **Resumo do mês** com o total de horas.
- **Exportar PDF**: abre a tela "PDF pronto" com 3 opções (downloads automáticos são bloqueados no celular):
  - **Enviar / Compartilhar** (`navigator.share` com o arquivo) → tela nativa do celular, para mandar direto
    por e-mail/WhatsApp à contabilidade. Só aparece quando o aparelho suporta compartilhar arquivos.
  - **Baixar PDF** e **Ver PDF**.
  - Colunas do PDF: **Data, Dia, Horário, Horas, Observação** + Total no rodapé. O **tipo (50%/100%) NÃO sai
    no PDF** (a pedido dela; continua só no app).

## Arquivos (`controle-horas-extras/`)
- `index.html` (telas e modais; dialogs), `style.css` (tema escuro, verde), `app.js` (lógica: calendário,
  lançamentos, resumo, exportação/compartilhamento do PDF, configurações), `holidays.js` (cálculo de feriados
  nacionais e de Contagem; cálculo da Páscoa; feriados personalizados), `manifest.json`, `icons/`, `README.md`.
- Na raiz do repositório: `index.html` (redireciona para o app) e `.github/workflows/deploy-pages.yml`.

## Histórico (25/11/2026) — tudo publicado
- App criado: calendário + feriados + resumo + exportação em PDF (PR #2).
- PDF: compartilhar/baixar/ver em vez de download automático, que não funcionava no celular (PR #3).
- `index.html` na raiz redireciona para o app; encurta a URL e evita o 404 (PR #4).
- Removida a coluna de tipo (50%/100%) do PDF (PR #5).
- Horário padrão 18:00–20:00 ao lançar um dia novo (PR #6).
- Tipo padrão fixo em 100% (PR #7).
- App instalável com ícone próprio — manifest + ícones PNG, PWA (PR #8).
- Publicado no GitHub Pages; repositório tornado público; origem do Pages = GitHub Actions.

## Pendências / ideias
- Instalar como app: Chrome → menu ⋮ → "Instalar aplicativo" (remover antes o atalho antigo, que era só um
  atalho de página web, não atualiza sozinho).
- Possíveis melhorias já oferecidas: nome/mês no título do PDF, linha de assinatura no rodapé, botão para
  limpar o mês.
