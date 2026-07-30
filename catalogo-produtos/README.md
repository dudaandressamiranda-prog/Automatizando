# Catálogo de Produtos

Catálogo interno dos produtos vendidos nas lojas físicas e no ecommerce
(área comercial), com foto, código de barras, nome, marca, fornecedor e
categoria.

Projeto **totalmente separado** do Estoque Consulveter: banco Supabase
próprio, sem nenhuma integração entre os dois.

**Stack:** React + TypeScript + Supabase.

## Estado atual (etapa 1)

| Parte | Status |
| --- | --- |
| Estrutura do banco (`supabase/migrations/`) | ✅ rodada no projeto Supabase (verificado em 29/07) |
| Importador de CSV/Excel (`importador/`) | ✅ pronto, com testes |
| App React (consulta/cadastro, login, leitor de código) | ✅ pronto (`app/`) — falta publicar |
| Automação de fotos do painel admin | ⏳ depende dos pontos em aberto |
| Etiquetas | ⏳ design ainda não definido |

## Estrutura

```
catalogo-produtos/
├── supabase/migrations/   # SQL do banco (rodar no projeto Supabase novo)
├── importador/            # script que importa a planilha do painel admin
└── app/                   # app React de consulta/cadastro (celular e desktop)
```

## Passo 1 — Criar o projeto Supabase

1. Em https://supabase.com/dashboard, crie um projeto novo (ex.:
   `catalogo-produtos`) — **não** use o projeto do Consulveter.
2. Abra o **SQL Editor** e execute o conteúdo de
   `supabase/migrations/20260729000001_init.sql`.
3. Em **Authentication → Users**, crie seu usuário (email + senha).
   O login do app usará esse usuário; não há cadastro aberto.
4. Anote, em **Settings → API**: a URL do projeto, a chave `anon`
   (para o app, depois) e a `service_role` (para o importador).

## Passo 2 — Importar a planilha do painel admin

```bash
cd importador
npm install
cp .env.example .env    # preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY

# 1. simulação (não grava nada, só mostra o plano e os avisos)
npm run import -- ~/Downloads/produtos.csv

# 2. se o plano estiver certo, aplica
npm run import -- ~/Downloads/produtos.csv --apply
```

Aceita `.csv` e `.xlsx`. As colunas são reconhecidas automaticamente
pelos nomes usuais (Nome/Produto/Descrição, Código de Barras/EAN,
Marca, Categoria, Fornecedor, ID/Código/SKU, URL/Link). Se alguma não
for reconhecida:

```bash
npm run import -- produtos.xlsx --map name="Descrição do Item" --map barcode="EAN13"
```

### Como o importador evita duplicar (reimportações)

Cada linha é casada com a base nesta ordem:

1. **ID do painel admin** (`external_id`) — se a exportação tiver coluna
   de ID/código/SKU, é a chave mais confiável;
2. **código de barras**;
3. **nome + marca normalizados** (sem acento/caixa/espaços) — só quando
   há exatamente 1 candidato; empate gera aviso e a linha é pulada.

Regras de segurança:

- célula vazia na planilha **nunca apaga** um valor já cadastrado;
- um código de barras já cadastrado **nunca é trocado** por outro
  diferente (gera aviso para conferência manual);
- duplicatas dentro do próprio arquivo são detectadas e puladas;
- categorias novas são criadas automaticamente, sem duplicar por
  diferença de acento/caixa ("Rações" ≡ "rações").

Rode sempre a simulação primeiro; o `--apply` só executa o plano exibido.

> **Regra do ERP (Olist/Tiny):** o código de barras (GTIN/EAN) manda,
> nunca o SKU. No ERP usávamos variações de produto e o SKU ganhava um
> "x" na frente ou letras extras — então linhas com o mesmo GTIN/EAN
> são o mesmo produto físico, e o importador mantém só uma. A coluna
> SKU é ignorada de propósito.
>
> **Kits ficam fora:** kits/combos de marketplace ("2 x ...", "Kit ...",
> "3 Pacotes ...") não são produtos do catálogo. O importador pula
> linhas com tipo "K" na coluna "Tipo do produto" (sem alarde, só conta
> no resumo) e linhas cujo nome parece anúncio (com aviso, para conferir
> no dry-run). Variações com código de barras próprio são produtos
> normais e entram.
>
> **Produto novo só entra com foto:** linha sem URL de imagem não vira
> produto novo (mas reimportação de produto já cadastrado atualiza
> normalmente). Para forçar, use `--incluir-sem-foto`.
>
> **Produto novo só entra ativo:** linha com situação Inativo/Excluído
> não vira produto novo; um produto já cadastrado que for inativado no
> ERP recebe a mudança de situação normalmente na reimportação.
>
> **Categorias:** `categorias-mapa.csv` traduz os nomes da planilha para
> a taxonomia curada do catálogo ("Medicamentos Shopee" → "Medicamentos"
> etc.) — edite o CSV para ajustar. E a categoria do ERP só **preenche**
> produto sem categoria: quem já foi categorizado no catálogo não é
> movido pela reimportação (curadoria manual vence).

### Como um produto ganha categoria

Três evidências, nesta ordem:

1. **categoria da planilha**, traduzida por `categorias-mapa.csv`;
2. **nome do produto** (`src/lib/classify.ts`) — regras com guardas contra
   falsos amigos: "osso mordedor" é brinquedo e "osso defumado" é petisco;
   "tapete gelado" é cama e "tapete higiênico" é higiene; coleira
   antipulgas é medicamento e coleira comum é acessório; ração renal é
   nutrição clínica (ração de prescrição), não medicamento;
3. **categoria que as lojas usam** para aquele código de barras
   (`src/lib/storecat.ts`), colhida junto com a foto pelo `npm run fotos`.

O classificador devolve `null` quando não tem certeza (ex.: "Ração
Premium 15kg", sem espécie) — melhor deixar para revisão manual no app do
que chutar. Foto como referência resolve o resto: produtos cujo cadastro
no ERP veio sem nome foram identificados abrindo a imagem.

### Relatório de faltantes

Compara a planilha **completa** do ERP com o catálogo e lista o que está
fora e por quê — é a lista de trabalho para ir alimentando aos poucos:

```bash
npm run faltantes -- ~/Downloads/produtos.csv
```

Sai um resumo no terminal e um `faltantes.csv` (abre no Excel) ao lado
da planilha, ordenado por prioridade: aptos a importar → ativos sem
foto → inativos → kits. Cada linha traz nome, código de barras, ID do
ERP e o motivo de estar fora.

### Robô de fotos

Para os produtos ativos sem foto: procura a imagem na internet pelo
código de barras (APIs públicas de catálogo de grandes pet shops —
American Pet, Cobasi) e importa o produto já com a foto:

```bash
npm run fotos -- ~/Downloads/produtos.csv           # só procura e lista
npm run fotos -- ~/Downloads/produtos.csv --apply   # importa o que achou
```

Só aceita foto quando o EAN da loja bate exatamente com o nosso. O que
o robô não acha (produto sem EAN, apresentação fora de linha) fica no
relatório de faltantes — resolve-se com busca assistida numa sessão do
Claude (que combina busca na web + extração da foto da página) ou com
foto manual pelo app.

## Passo 3 — O app (`app/`)

App React + TypeScript (Vite) para usar no celular e no computador:

- **Login** com o usuário criado no Supabase (nada é público);
- **Busca** por trecho do nome/marca, ignorando acentos ("racao" acha
  "Ração"), e por código de barras;
- **Leitor de código de barras** pela câmera (botão 📷) — se o código
  não existir, oferece cadastrar na hora já com o código preenchido;
- **Cadastro/edição** com foto (câmera ou galeria), categoria (com
  criação na hora, sem duplicar por acento/caixa), status e observações;
- Fotos ficam no bucket privado e aparecem via URL assinada, só logado.

Para rodar localmente:

```bash
cd app
npm install
cp .env.example .env   # preencha com a URL do projeto e a chave anon
npm run dev            # abre em http://localhost:5173
```

Para publicar (necessário para a câmera funcionar no celular, que exige
HTTPS): qualquer host de site estático serve — Vercel, Netlify ou
Cloudflare Pages. Build com `npm run build` (sai em `app/dist/`),
configurando as duas variáveis `VITE_*` no painel do host.

## Lojas e carrinho

O catálogo atende duas lojas (**Centro** e **Eldorado**). A loja de cada
login vem de `user_metadata.store` no Supabase (`"centro"` ou
`"eldorado"`) — defina no cadastro do usuário. Quem não tem loja fixa
(ex.: o admin) escolhe a loja numa tela após o login; a escolha fica no
aparelho e pode ser trocada pelo menu.

**Carrinhos** (listas de compra/pedido): ficam no banco (tabelas `carts`
e `cart_items`, migration `20260730000002_carrinhos.sql`). Cada loja tem
vários carrinhos nomeados; cada item guarda quem adicionou e quando. Nas
categorias, a bolinha marca produtos e, ao sair, um pop-up pergunta se
salva no carrinho ativo — acumulando pelas categorias.

Acesso por RLS, a partir dos metadados do login:
- funcionário (`user_metadata.store = 'centro'|'eldorado'`) vê e edita só
  os carrinhos da sua loja;
- admin (`user_metadata.role = 'admin'`) vê os das duas lojas, na página
  "Carrinhos (todas as lojas)".

### Configurar os acessos

1. **Login (email/senha):** crie no painel do Supabase em
   **Authentication → Users → Add user** (marque *Auto Confirm*).
2. **Admin (você):** `{ "role": "admin" }` no User Metadata do seu
   usuário, e o mesmo email em `VITE_ADMIN_EMAILS` (no Vercel).
3. **Loja do funcionário:** definida **pelo app**, no menu
   **Funcionários e lojas** (admin) — digita o email e escolhe a loja. Não
   precisa mexer em SQL nem metadata. A loja fica na tabela `store_members`
   e o funcionário entra **travado** nessa loja (não escolhe nem troca).

Funcionário sem loja vinculada vê um aviso pedindo para o responsável
liberar, e não acessa carrinho nenhum (o RLS barra).

## Área administrativa

A barra lateral do app tem uma seção **Administração** (Cadastrar produto,
A revisar, Logs de atividade) que só aparece para quem está na lista
`VITE_ADMIN_EMAILS` (emails separados por vírgula, configurada no host).
Vazia = o único usuário logado é tratado como admin. As rotas admin
(`#/novo`, `#/revisao`, `#/logs`) também redirecionam para o início quando
o usuário não é admin.

> **Importante — isto é controle de tela, não de banco.** Esconder o menu
> não impede um usuário logado de gravar via API, porque hoje o RLS
> concede `for all to authenticated`. Enquanto só existe o seu login, isso
> basta. **Quando forem criados logins para funcionários**, é preciso levar
> o papel de admin para o banco: uma tabela `profiles(user_id, role)` e
> policies que só deixem `role = 'admin'` escrever, mantendo leitura para
> os demais. Posso implementar essa migration quando você chegar nessa
> etapa.

## A fazer (próxima sessão)

**Consolidar produtos "pai" sem EAN na lista de revisão.** Muitos itens
desativados por falta de código de barras são, na verdade, o cadastro
"pai" (genérico, sem EAN) cujas variações "filho" — com EAN — já estão no
catálogo. Ex.: "Emedron" sem EAN na revisão, enquanto "Emedron 25mg",
"Emedron 50mg" etc. já existem com código. Esses pais são redundantes.

Plano: script que, para cada produto sem EAN na revisão, procura no
catálogo (produtos ativos com EAN) variações cujo nome comece pela mesma
raiz — e confirma pela internet/foto quando o nome for ambíguo. Onde
houver variações já cadastradas, o pai vira redundante e sai da revisão
(descartado/consolidado). Gerar relatório para aprovação antes de remover.
Deve eliminar boa parte da lista de revisão.

## Decisões sobre a estrutura proposta

A base é a que você propôs, com estes ajustes (nada travado — dá para
reverter qualquer um):

- **`photo_path` em vez de `photo_url`** — guardamos o caminho dentro do
  bucket, e o app monta a URL. Assim o bucket pôde ser criado **privado**
  (foto só aparece logado, via URL assinada), e trocar para público
  depois não exige reescrever a base. Também há `photo_source_url`
  (de onde a foto veio) e `photo_updated_at`, que a automação de fotos
  vai usar para saber o que ainda falta baixar.
- **`external_id` / `external_url`** — o ID do produto no painel admin e
  o link da tela de edição. São a chave da reimportação e o que torna a
  automação de fotos possível (ponto em aberto nº 3).
- **`source` como texto + check** (não enum) com valores `site_admin`,
  `pdf_fornecedor`, `erp`, `manual` — adicionar fonte nova é trocar uma
  linha, sem `ALTER TYPE`.
- **`dedupe_key` (coluna gerada)** — nome+marca normalizados, usada na
  deduplicação. A normalização existe em SQL (`catalog_norm`) e em
  TypeScript (`importador/src/lib/normalize.ts`) e as duas precisam
  andar juntas.
- **`barcode` com check de formato** (6–14 dígitos) e **único só quando
  preenchido** (índice parcial) — vários produtos podem ficar sem código.
- **`notes`** — campo livre para observações suas.
- **RLS em tudo**: só usuário autenticado lê/escreve; nada é público.
- **Trigram index** no nome — busca por trecho ("shamp inf" acha
  "Shampoo Infantil") já preparada para o app.

## Pontos em aberto (antes da automação de fotos)

Continuam pendentes de verificação no painel admin — nada aqui depende
deles ainda:

1. **Login automatizado**: a decidir entre reutilizar cookie de sessão
   (mais simples, expira) ou login por script com usuário/senha via
   variável de ambiente. Vou detalhar riscos quando formos implementar.
2. **Anti-bot / Cloudflare**: verificar se a área logada do painel passa
   pelo Cloudflare. Se houver challenge, a alternativa segura é um modo
   semi-automático (você navega, o script coleta).
3. **A exportação traz ID/slug?** — se sim, o importador já captura
   (`external_id`) e a automação de fotos consegue montar a URL de
   edição de cada produto. **Vale conferir os cabeçalhos do CSV
   exportado**: é o primeiro dado concreto para fechar esse ponto.
4. **Foto original vs. comprimida** — conferir na tela de edição se o
   link da imagem é o arquivo original.
5. **Reimportação** — ✅ resolvido: é o mecanismo de casamento descrito
   acima.

## Observação sobre o repositório

O plano é este projeto ter um repositório GitHub próprio. Por enquanto
ele está na pasta `catalogo-produtos/` deste repositório; quando o novo
repo for criado, é só mover a pasta (o histórico começa limpo lá).
