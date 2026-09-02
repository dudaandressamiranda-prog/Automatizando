# Controle de Horas Extras

App web (client-side, sem backend) para registrar horas extras direto num
calendário e exportar um relatório em PDF para enviar à contabilidade —
substitui a planilha do Excel que precisava ser remontada todo mês.

## Como usar

1. Abra `index.html` num navegador (funciona local ou hospedado em
   GitHub Pages / Netlify / Vercel, como o app `app/` deste repositório).
2. Navegue até o mês desejado e toque num dia para lançar a hora extra
   (tipo, horário de início/fim — as horas são calculadas automaticamente
   — e uma observação opcional).
3. O resumo do mês, com o total de horas, aparece logo abaixo do
   calendário.
4. Clique em **Exportar PDF** para gerar o relatório (título, nome do(a)
   colaborador(a) e filtro por tipo de hora extra são editáveis na hora
   da exportação).

Todos os dados ficam salvos apenas no `localStorage` do navegador — nada
é enviado para nenhum servidor.

## Feriados mostrados no calendário

- **Nacionais**: calculados automaticamente ano a ano (inclusive os
  móveis, como Sexta-feira Santa e Corpus Christi, a partir do cálculo
  da Páscoa).
- **Municipais de Contagem/MG**: Jubileu de Nossa Senhora das Dores
  (móvel, sexta-feira anterior ao Domingo de Ramos) e Nossa Senhora da
  Conceição (8/12), conforme a Lei Municipal nº 3.484/2001. O
  aniversário de Contagem (30/08) é marcado como ponto facultativo, não
  como feriado obrigatório.
- **Pontos facultativos** de abrangência nacional (Carnaval, Corpus
  Christi) também aparecem marcados, com um estilo diferente dos
  feriados obrigatórios.

Como decretos municipais podem mudar de um ano para o outro, o botão
**⚙️ Configurações** permite cadastrar feriados personalizados (data +
nome) caso o calendário oficial da sua empresa seja diferente em algum
dia específico — vale a pena conferir o decreto anual da Prefeitura de
Contagem antes de fechar a folha de um mês importante.

## Tecnologias

HTML/CSS/JS puro, sem build. PDF gerado com
[jsPDF](https://github.com/parallax/jsPDF) + `jspdf-autotable`, carregados
via CDN.
