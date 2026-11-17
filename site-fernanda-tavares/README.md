# Site – Fernanda Tavares | Endocrinologia e Metabologia Veterinária

Site de uma página (HTML + CSS + JS puros, sem build), pensado para quem procura
**"endocrinologista veterinário em BH"** e região encontrar a Fernanda e chamar no WhatsApp.

## Estrutura

```
site-fernanda-tavares/
├── index.html      # conteúdo + SEO (title, description, dados estruturados)
├── styles.css      # identidade visual (cores e hexágonos da logo)
├── script.js       # CONFIG de WhatsApp/Instagram, menu mobile, animações
├── robots.txt
├── sitemap.xml
└── assets/         # logo sem fundo, favicon, imagem de compartilhamento
```

Identidade visual tirada da logo: rosa `#f8a2a0`, menta `#95f3c4`, ciano `#b9fdfc`,
amarelo `#fff5c2` e azul-petróleo `#4e7a83`; títulos em Noto Serif (parecida com a
fonte da logo) e textos em Nunito Sans. Os hexágonos aparecem em ícones, marcadores e fundos.

## ✏️ Antes de publicar: preencher os dados reais

| O que | Onde | Valor provisório |
|---|---|---|
| WhatsApp (DDI+DDD+número) | `script.js` → `CONFIG.whatsapp` **e** buscar/substituir em `index.html` | `5531900000000` |
| Telefone nos dados estruturados | `index.html` → `"telephone"` | `+55-31-90000-0000` |
| Instagram | `script.js` → `CONFIG.instagram` **e** `index.html` (`sameAs` e botão) | `SEU_INSTAGRAM` |
| CRMV | `index.html` (seção Sobre e rodapé) | `CRMV-MG 00000` |
| Formação / títulos | `index.html` → lista `.credentials` | `[instituição]` |
| Domínio do site | `index.html` (canonical, og:*, JSON-LD), `robots.txt`, `sitemap.xml` | `fernandatavaresvet.com.br` |
| Foto da Fernanda (opcional, recomendado) | salvar em `assets/fernanda.jpg` e trocar o `src` na seção Sobre | logo |
| Cidades atendidas e modalidade (clínica, domiciliar, online) | seções "Onde atendo" e FAQ | região metropolitana de BH |

Dica: no VS Code, `Ctrl+Shift+H` faz buscar/substituir em todos os arquivos da pasta.

## 🚀 Como colocar no ar (grátis)

Qualquer hospedagem de site estático serve. Mais simples:

1. **Netlify** (netlify.com) → "Add new site" → "Deploy manually" → arrastar a pasta
   `site-fernanda-tavares`. Ou **Vercel** / **GitHub Pages** apontando para esta pasta.
2. Registrar um domínio `.com.br` em **registro.br** (ex.: `fernandatavaresvet.com.br`)
   e apontar para a hospedagem (a Netlify/Vercel mostram o passo a passo).

## 🔎 Para aparecer no Google quando buscarem "endocrino vet BH"

O site já vem com: título e descrição focados em BH, palavras-chave nos títulos,
dados estruturados (`VeterinaryCare` + `FAQPage`), sitemap, região atendida e
compartilhamento bonito no WhatsApp. Para completar:

1. **Perfil da Empresa no Google (Google Meu Negócio)** — é o que mais traz paciente
   em busca local ("perto de mim", mapa). Categoria: *Veterinário*; colocar o link do
   site, WhatsApp, horários, fotos, e pedir **avaliações** aos tutores satisfeitos.
2. **Google Search Console** (search.google.com/search-console) — cadastrar o domínio
   e enviar o `sitemap.xml` para o Google indexar mais rápido.
3. Colocar o link do site na **bio do Instagram** e pedir que clínicas parceiras
   linkem o site.
4. Com o tempo, criar páginas/artigos específicos (ex.: "Diabetes em gatos em BH",
   "Cushing em cães") — cada um vira uma nova porta de entrada no Google.
