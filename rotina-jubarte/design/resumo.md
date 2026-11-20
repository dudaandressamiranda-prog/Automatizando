# App Mari — resumo

Última atualização: 20/11/2026

## O que é
Um app para a Mari organizar a rotina, as contas e as demandas. A Mari é TEA e tem disfunção executiva, então o app foi pensado para mostrar **uma coisa de cada vez**, sem pressa e sem cobrança. O tema junta duas coisas de que ela gosta: **baleias jubarte** e o estilo **aconchegante (cozy)**.

- **Link do app:** https://dudaandressamiranda-prog.github.io/Automatizando/mari/
- **Como instalar no iPhone:** abrir o link no Safari → Compartilhar (□↑) → "Adicionar à Tela de Início".
- **Código:** repositório Automatizando, pasta `rotina-jubarte` (o app pronto fica na pasta `mari`).

## O que já foi decidido
- **Nome:** Mari. A tela diz "Bom dia, Mari!".
- **Visual aprovado pela Mari:** azul do oceano, creme de manta, luz de abajur dourada, modo noite azul-escuro.
- **4 baleias em aquarela**, criadas por você no Ideogram:
  - **principal** (sem cachecol): ícone do app e "Bom dia";
  - **clara**: passo a passo e telas vazias;
  - **dourada**: contas e comemorações ("Tudo pago!");
  - **de cachecol**: noite e "Dia concluído".
- **Login (decidido em 20/11):** a Mari contou que o app do celular e o do computador não conversam, e ela tinha que fazer tudo de novo. Por isso o app vai ter **login**, e os dados vão ficar num servidor. O que ela fizer num aparelho vai aparecer no outro em segundos.
  - A sugestão é entrar com **um código que chega no e-mail**, sem senha. "Entrar com Google" pode vir depois.
  - **Falta confirmar:** qual dos dois vocês preferem e se a Mari tem conta Google.
  - No primeiro login, o app vai perguntar qual versão manter (a do celular ou a do computador) e vai guardar uma cópia da outra.
  - Até o login ficar pronto, os dados continuam só em cada aparelho. A "Cópia de segurança" continua valendo.
- **Celular dela:** iPhone.
- **Letra:** tamanho padrão. A opção "tamanho das letras" foi testada e tirada a pedido.

## O que o app faz (versão 1, no ar desde 19/11)
1. **Hoje:** o que fazer agora (com um círculo que mostra o tempo acabando), o que vem depois, contas vencendo e demandas do dia.
2. **Passo a passo:** uma tarefa dividida em pedacinhos, com cronômetro e a baleia nadando pelas etapas.
3. **Contas:** contas de todo mês ou de uma vez só, botão "Paguei" e botão para copiar o código de barras ou o Pix.
4. **Demandas:** coisas a fazer (com prioridade) e compromissos (com aviso 1 hora antes).
5. **Semana:** o que vem pela frente, separado por cores, e um resumo de amanhã.
6. **Ajustes:** montar as rotinas, escolher as cores, ligar os avisos, passar os lembretes para o Calendário do iPhone e fazer a cópia de segurança.

**Revisão de usabilidade feita:** botão "Desfazer" depois de "Feito" e "Paguei", janela que não perde o que foi digitado, cores mais fáceis de ler e botões maiores para o dedo.

## Próximos passos (nesta ordem)
1. **Apple Watch + reforço** (grátis): um segundo aviso, 10 minutos depois, nos lembretes do Calendário, e as instruções para as notificações aparecerem no relógio.
2. **Servidor + login + celular e computador iguais + notificações que repetem até ela marcar "Feito"** (aprovado). O servidor fica numa **organização grátis nova no Supabase**, separada do Lobinha.
3. **WhatsApp:** lembrete que repete até ela tocar em "✅ feito".
   - Ela não tem chip extra e não quer pagar, então a ideia é usar o mesmo serviço grátis do bot da loja (aquele que lembra de contar a vacina às 17:50).
   - **Falta:** um print de uma mensagem desse bot, para saber qual é o serviço.
   - **Falta decidir:** de quanto em quanto tempo ele relembra, se ele para à noite e se lembra só das demandas e contas ou também de cada passo da rotina.

## Cuidados
- **Mudar o app para o GitHub ou o Supabase da Mari muda o endereço.** Os dados dela não vão junto sozinhos. Antes de trocar, ela faz "Cópia de segurança" no app antigo e "Restaurar uma cópia" no novo.
- **O site do Automatizando também tem o "Controle do consultório".** Toda publicação precisa manter ele junto, senão ele sai do ar.
- **Instruções para o Claude:** estão no arquivo CLAUDE.md desta pasta, que também está no código.
