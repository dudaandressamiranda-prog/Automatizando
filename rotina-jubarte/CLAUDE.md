# App Mari — contexto do projeto (leia antes de tudo)

App de rotina, contas e demandas feito para a **Mari** (irmã da Andressa). A Mari é TEA, tem disfunção
executiva e precisa de rotina totalmente programada. Hiperfoco em **baleias jubarte**; gosta de coisas
**cozy** (aconchegantes). A Andressa (duda.andressa.miranda@gmail.com) cuida do projeto: decide, testa e
repassa os pedidos da Mari. Fala pt-BR, quer explicações simples e passo a passo, usa muito o celular.

## Regras de trabalho (da Andressa)
- ECONOMIZAR USO: nada de agentes em paralelo sem pedir; um teste por mudança; prints só quando houver decisão visual.
- Mostrar prints antes de publicar mudanças visuais (Playwright local, enviar com SendUserFile).
- GUARDAR TUDO NO PROJETO: todo arquivo que ela mandar (imagens, vídeos) vai para o repositório na hora
  (original em `design/<assunto>/`), com commit e push, antes de qualquer outro passo. Scratchpad/tmp é só rascunho.
- Ao fim de cada tarefa: commit + push. Atualizar este CLAUDE.md e o `resumo.md` do Drive
  (Segundo Cerebro - My Jarvis › Segundo-Cerebro-Projetos › Projetos › App Mari, pasta id 10LjD1jRGK49TONIyofWZaVZLuw5W4F5y;
  atualizar = criar arquivo novo e mandar o antigo para a lixeira).
- Perguntas com AskUserQuestion: ela já clicou opção sem querer uma vez. Para ações que mexem no ar
  (publicar, juntar branches), confirmar em texto antes de executar e dizer exatamente o que vai acontecer.
- Não publicar nem mexer em branch de outro projeto sem ok explícito.

## Onde está o código HOJE (19/11/2026)
- Repositório público `dudaandressamiranda-prog/Automatizando`, branch de trabalho `ccr-1fa24072-klyxzu`:
  - `rotina-jubarte/` = código-fonte (React 18.3 + TypeScript 5.6 + Vite 6.4, PWA, sem login).
  - `mari/` (na raiz) = app pronto gerado por `npm run build` (vite outDir `../mari`, base `./`).
- NO AR: **https://dudaandressamiranda-prog.github.io/Automatizando/mari/** (GitHub Pages do repo inteiro).
  Publica quando há push no branch `claude/smart-gate-mobile-control-axjq9x` (workflow deploy-pages.yml).
  ATENÇÃO: o site também serve o "Controle do consultório" (`controle-consultorio/`, vindo do branch
  `claude/sweet-darwin-d9yas8`). Ao publicar pelo smart-gate, o sweet-darwin precisa estar junto (já foi
  juntado em 19/11, merge e3df919), senão o consultório sai do ar.
- PLANO: a Andressa vai continuar num repositório/Supabase DA MARI. Ao mudar de endereço (outro domínio),
  os dados da Mari NÃO vão junto (ficam no localStorage do endereço antigo): antes de trocar, a Mari faz
  "Cópia de segurança" em Ajustes no endereço antigo e "Restaurar uma cópia" no novo. Manter o endereço
  antigo no ar até ela migrar.

## Como rodar
```
cd rotina-jubarte && npm install
npm run dev          # http://localhost:5190
npm run build        # gera ../mari (ajustar outDir se o repo mudar)
npx vite preview --port 5191
node design/teste-telas.cjs <pasta>        # percorre as telas com relógio fixo (qui 19/11 07:48) e dados de exemplo
node design/teste-usabilidade.cjs <pasta>  # desfazer, janela que não perde texto, 375 px
```
Playwright já vem instalado no ambiente (require('playwright')).

## Identidade visual (APROVADA pela Mari)
- Nome do app: **Mari** (ela não quis trocadilho). Saudação "Bom dia/Boa tarde/Boa noite, Mari!".
- Paleta (tokens em `src/styles.css`): oceano #2D5B78, mar raso #9CC2D1, creme #F5EDE1, papel #FFF9F0,
  luz de abajur #D9963F, alga #5E9277, coral #C96A5C; modo noite #13283A com âmbar #F0B86A como cor principal.
  Contraste revisado: texto secundário `--soft` #4F6575, `--kelpink`, `--ckline` (bordas de marcar ≥ 3:1).
- Fontes: Fraunces (títulos, SOFT 100) + Nunito (texto). Atkinson foi descartada (zero cortado atrapalha horários).
- Baleias em aquarela (geradas pela Andressa no Ideogram/Nano Banana Pro). Originais em
  `design/baleias/jubarte-*-original.png`; recorte por IA com `python3 design/baleias/recortar.py`
  (rembg isnet-general-use + tapa furos; cor sempre da imagem original) → `public/baleias/*.webp`.
  - principal (sem cachecol): ícone do app, "Bom dia" de dia, Ajustes.
  - clara (virada para a esquerda; espelhada no passo a passo): baleia que nada pela linha de etapas, telas vazias.
  - dourada: resumo das Contas, "Tudo pago este mês!", "Rotina concluída!".
  - cachecol: noite (19h–5h no topo da Hoje), "Dia concluído", cartão "Amanhã" da Semana.
- Ícones do app (`public/icons/`) = baleia principal em fundo creme.
- Princípios para TEA: uma coisa de cada vez, nada pisca, `prefers-reduced-motion` respeitado, textos sem
  pressão ("Ainda dá para pagar", "Passou do tempo · Tudo bem. Termine com calma."), botões ≥ 44 px,
  Desfazer após Feito/Paguei, janela com texto digitado não fecha ao tocar fora sem perguntar.
  "Tamanho das letras" foi testado e RETIRADO a pedido (fica o padrão).

## O que o app faz (v1, publicado 19/11)
- Hoje: cartão AGORA/PRÓXIMO com círculo de tempo, DEPOIS, contas que pedem atenção, demandas do dia, rotina do dia.
- Passo a passo (Foco): um passo por vez, pedacinhos, cronômetro com pausa, baleia nadando, tela acesa (wakeLock).
- Contas: mensal (dia) ou única; Paguei/Desfazer; copiar código/Pix; conta mensal só conta a partir do mês
  em que foi cadastrada (`since`).
- Demandas: tarefa (prioridade, data/hora opcionais) e compromisso (data obrigatória, aviso 1 h antes).
- Semana: dias com bolinhas por tipo (rotina/conta/compromisso/demanda), agenda do dia, cartão "Amanhã".
- Ajustes: rotinas (dias, passos, hora, duração, pedacinhos), nome, cores (automático/dia/noite), avisos,
  Calendário do iPhone (.ics), cópia de segurança (JSON; compartilhar → iCloud).
- Dados: `localStorage` chave `mari-dados-v1` (`src/store.ts`); se não conseguir ler, guarda o texto
  antigo em `mari-dados-v1-reserva-<ts>` (nunca apaga). Começa com rotina da manhã e da noite de exemplo.
- Avisos hoje (`src/avisos.ts`): notificação só com o app aberto/recente (confere a cada 20 s) +
  arquivo .ics para o Calendário do iPhone (RRULE semanal/mensal, VALARM), que toca com o app fechado.

## DECISÃO 20/11: LOGIN E SINCRONIZAÇÃO ENTRE APARELHOS
Problema relatado pela Mari: o app do celular e o do computador não conversam (cada aparelho tem seus
próprios dados no localStorage) e ela tem que fazer tudo de novo. Decisão da Andressa: **usar login**
(a decisão "sem login" do começo caiu). Fazer JUNTO com o passo 2 (o mesmo Supabase vira a "memória" do app).
- Login sugerido: **código por e-mail (OTP do Supabase Auth, sem senha)**, que não exige configurar nada no
  Google Cloud; "Entrar com Google" pode vir depois. CONFIRMAR com ela qual prefere e se a Mari tem conta Google.
- Tabelas com RLS por usuário (rotinas, passos, contas, pagamentos, demandas, feitos do dia); app continua
  funcionando offline (cache local) e sincroniza ao voltar a internet; atualização em tempo real (Realtime)
  para o outro aparelho ver em segundos.
- PRIMEIRO LOGIN: ela já tem dados diferentes em cada aparelho. Perguntar qual versão manter (a do aparelho
  que ela mais usa, provavelmente o celular); antes, guardar automaticamente uma cópia de segurança da outra
  (download/arquivo local) para nada se perder. NÃO mesclar sozinho (as rotinas de exemplo têm ids diferentes
  em cada aparelho e duplicariam).
- Com login, a "Cópia de segurança" vira opcional (manter o botão mesmo assim).

## PRÓXIMOS PASSOS (combinados com a Andressa em 19/11 — seguir nesta ordem)
Pedido da Mari: ela pula notificações quando está ocupada e esquece; quer Apple Watch e WhatsApp, com o
lembrete repetindo até ela fazer.
1. **Apple Watch + reforço (grátis, rápido) — NÃO FEITO AINDA.** Em `gerarIcs`, adicionar um 2º VALARM
   de reforço (ex.: TRIGGER:PT10M) em passos e demandas com hora (compromisso já tem -PT60M; pôr também PT0M).
   Na janela "Calendário do iPhone" (Ajustes.tsx), instruções: app Watch → Notificações → Calendário (e Mari)
   → "Espelhar o iPhone". Notificações chegam no Watch quando o iPhone está bloqueado.
2. **Servidor + LOGIN + sincronização + notificações que repetem até "Feito" (APROVADO).** Supabase em
   ORGANIZAÇÃO GRÁTIS NOVA (decisão dela; não usar a org paga "PetLife"/Lobinha, que custaria ~US$ 10/mês).
   Login (ver DECISÃO 20/11 acima); o app sincroniza tudo com o servidor. Web Push (VAPID) para iPhone
   com app instalado (iOS 16.4+), cron a cada minuto, repetir a cada X min até marcar Feito; horário de silêncio.
   Também aparece no Watch.
3. **WhatsApp.** Ela NÃO tem chip extra e não quer pagar. No "Controle Centro" (loja) existe um bot que manda
   msg às 17:50 lembrando de contar vacina, sem custo — NÃO foi encontrado nos repositórios (consulveter-centro,
   Automatizando, Consulveter-Estoque) nem no Supabase acessível; provável CallMeBot ou similar.
   Pedir a ela um PRINT de uma dessas mensagens (remetente) para confirmar o serviço. Modelo proposto:
   envio de mão única (o serviço grátis não recebe resposta) com link "✅ Toque aqui quando terminar"
   (Edge Function marca feito) e relembra a cada X min até feito no link ou no app. Bot oficial da Meta
   (com botão dentro do WhatsApp) exige número próprio e tem custo por mensagem — descartado por ora.
   EM ABERTO: intervalo (10/15/30 min), parar à noite (ex.: 22h), lembrar só demandas/contas ou também
   cada passo da rotina.
- Google Agenda: o .ics pode ser adicionado a um calendário da conta Google no iPhone (opção 1, já funciona).
  Integração direta com login Google (opção 2) ficou de fora por enquanto.

## Arquivos
`src/store.ts` (tipos, dados, datas, cálculos), `src/Hoje.tsx`, `src/Foco.tsx`, `src/Contas.tsx`,
`src/Demandas.tsx`, `src/Semana.tsx`, `src/Ajustes.tsx` (+ editor de rotina), `src/avisos.ts` (avisos e .ics),
`src/ui.tsx` (Baleia, Check, Ring, Sheet, toast/desfazer, ícones), `src/styles.css`, `public/sw.js`
(rede primeiro, cache para offline, clique na notificação abre o app), `public/manifest.webmanifest`,
`design/` (propostas visuais, originais, scripts de teste e recorte).
