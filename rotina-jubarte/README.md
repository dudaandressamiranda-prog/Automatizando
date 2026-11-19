# Mari — rotina, contas e demandas (tema jubarte aconchegante)

App instalável (PWA) feito para a Mari: rotina com horário e passo a passo, contas a pagar,
demandas/compromissos e visão da semana. Tudo fica guardado **só no celular dela** (sem login).

- Código: `rotina-jubarte/src` (React 18 + TypeScript + Vite 6)
- App pronto (o que vai para o ar): `/mari` na raiz do repositório (GitHub Pages)
- Arte: `design/baleias/*-original.png` (Nano Banana Pro via Ideogram) → `python3 design/baleias/recortar.py` → `public/baleias/*.webp`
- Propostas visuais: `design/telas.html`, `design/proposta-visual-*.png`

## Rodar e publicar
```
cd rotina-jubarte
npm install
npm run dev        # http://localhost:5190
npm run build      # gera ../mari
```
Teste de telas: `npm run build && npx vite preview --port 5191` e `node design/teste-telas.cjs <pasta-dos-prints>`.

## Como funciona
- **Hoje**: cartão "Agora" (ou "Próximo") com círculo de tempo, "Depois", contas que pedem atenção,
  demandas do dia e a rotina do dia (toque para marcar).
- **Passo a passo**: um passo por vez, pedacinhos para marcar, cronômetro com pausa, baleia nadando pelas etapas,
  tela acesa enquanto aberto.
- **Contas**: mensais (dia do vencimento) ou únicas; "Paguei"/"Desfazer"; copiar código/Pix. Conta mensal
  só conta a partir do mês em que foi cadastrada (`since`).
- **Demandas**: tarefas (prioridade, data/hora opcionais) e compromissos (data obrigatória, aviso 1 h antes).
- **Semana**: dias com bolinhas por tipo e agenda do dia escolhido.
- **Ajustes**: rotinas (dias, passos, horário, duração, pedacinhos), nome, cores (automático/dia/noite),
  avisos, lembretes no Calendário do iPhone (.ics) e cópia de segurança (JSON).

## Avisos no iPhone
- Notificações do app: só depois de instalado ("Adicionar à Tela de Início", iOS 16.4+) e funcionam com o
  app aberto/recente (`src/avisos.ts`, confere a cada 20 s).
- Alarmes que tocam sempre, com o app fechado: **Calendário do iPhone** (arquivo .ics gerado em Ajustes, com
  repetição semanal/mensal e alerta). Mudou a rotina → apagar o calendário "Mari" e gerar de novo.
- Futuro (se quiserem): servidor de push (Web Push) para avisar com o app fechado sem usar o Calendário.

## Dados
`localStorage` chave `mari-dados-v1`. Se um dia não conseguir ler, o conteúdo antigo é guardado em
`mari-dados-v1-reserva-<data>` (nunca é apagado).

## Revisão de usabilidade (19/11/2026)
- Contraste: textos secundários `--soft` #4F6575 (≥ 4,8:1), verde de texto `--kelpink`, borda das bolinhas `--ckline` (≥ 3:1).
- Área de toque ≥ 44–48 px (bolinhas com área invisível maior; botões e abas).
- "Feito", "Paguei" e demanda feita mostram aviso com **Desfazer** (6 s).
- Janela com texto digitado não fecha ao tocar fora sem perguntar.
- Passo a passo: quando o tempo passa, "Passou do tempo · Tudo bem. Termine com calma." (sem pressão).
- Ajustes → **Tamanho das letras** (Normal, Grande, Maior; usa zoom da página). Testado a 375 px sem rolagem lateral.
- Leitor de tela: bolinhas dentro de linhas tocáveis são só desenho; a linha tem `aria-pressed`. Janelas com `aria-modal`.
- Emojis ficam só como ícone das contas (escolhidos por ela), não na navegação.
- Teste: `node design/teste-usabilidade.cjs <pasta>` com o preview na porta 5191.
