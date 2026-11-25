# Site Fernanda Tavares — contexto do projeto (leia antes de tudo)

Site profissional da **Dra. Fernanda Tavares**, médica veterinária de **Endocrinologia e Metabologia
Veterinária** (cães e gatos) em **Belo Horizonte e região metropolitana**. Objetivo: aparecer no Google
quando buscarem "endocrinologista veterinário BH" / "endocrino vet BH" e levar o tutor a chamar no WhatsApp.
A Andressa faz o site para a Fernanda: decide, testa e repassa. Fala pt-BR, quer explicações simples e
um passo por vez, usa muito o celular.

## Regras de trabalho
- Ao fim de cada tarefa: commit + push, e atualizar este CLAUDE.md e o `resumo.md` + `CLAUDE.md` do Drive
  (Segundo Cerebro - My Jarvis › Segundo-Cerebro-Projetos › Projetos › 09 - Site Fernanda Tavares,
  pasta id `1MOu441j2oxfH13X7OTWveY_zFGydZix-`; atualizar = criar arquivo novo e mandar o antigo para a lixeira).
  Se o status mudar, atualizar também a linha 09 do `Inicio.md` (índice do cofre do Obsidian).
- Mostrar prints/prévia antes de mudanças visuais (Playwright local, enviar com SendUserFile).
- Para ela ver o site: gerar a prévia em arquivo único (CSS, JS e imagens embutidos) e enviar.
  O gerador fica no scratchpad; refazer com Python: trocar `<link styles.css>` e `<script script.js>` pelo
  conteúdo e as imagens `assets/*.png` por data URI → `site-fernanda-tavares-preview.html` na raiz do repo.
- **Não publicar como Artifact do claude.ai** (leva nome e marca de uma pessoa real): o site vai ao ar
  no domínio dela.
- **Não inventar dados da Fernanda** (CRMV, formação, endereço, telefone). Usar marcador e perguntar.
- Conteúdo médico: educativo, sem prometer cura; rodapé já avisa que não substitui consulta.

## Onde está
- Repositório `dudaandressamiranda-prog/Automatizando`, branch `claude/beautiful-dirac-mu7t1n`,
  pasta `site-fernanda-tavares/`. Prévia em arquivo único: `site-fernanda-tavares-preview.html` (raiz).
- HTML + CSS + JS puros, sem build. Arquivos: `index.html` (conteúdo + SEO), `styles.css`, `script.js`
  (objeto `CONFIG` com WhatsApp, mensagens e Instagram), `robots.txt`, `sitemap.xml`, `assets/`, `README.md`.
- **Ainda não está no ar.** Plano: Netlify/Vercel (grátis) + domínio .com.br no registro.br.
  O GitHub Pages do repo publica outro branch (smart-gate) — não usar sem combinar.

## Identidade visual (da logo dela)
- Logo original: fundo preto, três hexágonos (rosa, menta, ciano) + pentágono amarelo, pata com cão e gato,
  arco azul-petróleo, "Fernanda Tavares" em serifada.
- Fundo preto removido por script (alpha pelo brilho, limiar 70) → `assets/logo-completa.png`,
  `assets/logo-simbolo.png`, `logo-simbolo-pequena.png` (cabeçalho), `favicon-48.png`,
  `apple-touch-icon.png`, `og-image.png` (1200×630 para compartilhar).
- Cores: rosa #f8a2a0, menta #95f3c4, ciano #b9fdfc, amarelo #fff5c2, azul-petróleo #4e7a83,
  texto #2f4c54, escuro #213a40, fundo #fbf9f4. Fontes: Noto Serif (títulos) + Nunito Sans (texto).
- Hexágono (`clip-path`) é o elemento da marca: ícones, marcadores, números das etapas, fundos.
  Seção "Como funciona" e rodapé escuros, lembrando a logo.

## Conteúdo (uma página)
Hero ("Endocrinologia veterinária em BH para cães e gatos") → O que é a especialidade (glândulas) →
Sinais de alerta → Doenças (diabetes, hipotireoidismo, hipertireoidismo felino, Cushing, Addison,
obesidade, cálcio/paratireoide, outras) → Como funciona (4 passos + bloco para colegas veterinários) →
Sobre a Dra. Fernanda → Cidades atendidas → Perguntas frequentes → Contato → Rodapé.
Botão flutuante do WhatsApp. Animação de entrada respeita `prefers-reduced-motion`.

## SEO
Title/description com "BH", canonical, Open Graph, `geo.*`, JSON-LD `VeterinaryCare` (areaServed com 10
cidades) e `FAQPage` (as perguntas do JSON-LD devem bater com as do HTML), sitemap e robots.
O que mais traz paciente local: Perfil da Empresa no Google + avaliações + Search Console.

## Pendências (dados provisórios — trocar em TODOS os lugares)
- WhatsApp `5531900000000` (script.js CONFIG + hrefs no index.html) e `+55-31-90000-0000` (JSON-LD).
- Instagram `SEU_INSTAGRAM` (CONFIG, botão, `sameAs`).
- `CRMV-MG 00000` (Sobre e rodapé); formação `[instituição]`; foto (`assets/fernanda.jpg`, trocar o src
  na seção Sobre — o CSS já recorta foto .jpg/.webp no hexágono).
- Domínio provisório `fernandatavaresvet.com.br` (canonical, og:*, JSON-LD, robots.txt, sitemap.xml).
- Confirmar com ela: cidades atendidas, modalidade (clínica/domiciliar/online) e o bloco
  "para colegas veterinários" (encaminhamento/discussão de casos) — foram suposições.
