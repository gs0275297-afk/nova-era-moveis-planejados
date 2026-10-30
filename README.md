# Nova Era Móveis Planejados: site

Site institucional de página única da Nova Era Móveis Planejados (Três Lagoas – MS), feito com
[Astro](https://astro.build) e pensado para publicação na Vercel.

## Comandos

| Comando | O que faz |
|---|---|
| `npm install` | instala as dependências (Node 24) |
| `npm run dev` | servidor local em `http://localhost:4321` |
| `npm run build` | confere os tipos (`astro check`) e gera o site em `dist/` |
| `npm run preview` | serve o `dist/` gerado, para conferir antes de publicar |
| `npm run assets` | refaz logo, fotos e vídeos a partir de `logo/` e `fotos e videos/` (material local; exige Python com Pillow, NumPy e imageio-ffmpeg) |
| `npm run texturas` | refaz as texturas procedurais do simulador e as versões leves (Python com Pillow e NumPy) |

O build (`npm run build`) não depende desses scripts nem do material bruto.

Em desenvolvimento, `http://localhost:4321/?movimento-completo` força as animações completas mesmo
quando o sistema pede movimento reduzido. Esse atalho não existe no site publicado.

## Onde editar o conteúdo

- `src/data/empresa.ts`: nome, frase da marca, endereço, telefone/WhatsApp, Instagram e mensagem padrão
  do WhatsApp. Só entram dados confirmados.
- `src/data/projetos.ts`: foto da abertura, projetos em destaque, galeria por ambiente (categorias e fotos)
  e itens da seção Detalhes.
- `src/components/`: uma seção por arquivo (Hero, Sobre, Projetos, Galeria, Detalhes, Contato, Rodape),
  mais Cabecalho, Lightbox, BarraMovel, Logo e Icone.
- `src/styles/global.css`: cores, tipografia, botões e o motivo das marcas de corte.
- `src/scripts/configurador/catalogo.ts`: acabamentos, cores, puxadores, luzes e vistas do simulador 3D.

### Simulador 3D (`src/components/Simulador.astro` + `src/scripts/configurador/`)

| Arquivo | Papel |
|---|---|
| `catalogo.ts` | opções do simulador (sem three.js: a interface usa antes da cena carregar) |
| `estado.ts` | configuração, desfazer, link compartilhável, configurações salvas, resumo |
| `materiais.ts` | biblioteca central de materiais e carga das texturas |
| `moveis.ts` | peças reutilizáveis: caixas, portas, basculantes, gavetas, puxadores |
| `ambientes/` | um módulo por ambiente, com geometria, luzes e vistas próprias (hoje, `cozinha.ts`) |
| `motor.ts` | renderização sob demanda, câmera, paredes em corte, comparação, captura, descarte |
| `index.ts` | liga o painel ao estado e ao motor |

`src/scripts/simulador.ts` fica no pacote principal e só baixa o three.js quando o simulador vai ser usado.

**Para adicionar um ambiente:** crie `ambientes/<nome>.ts` que cumpra o contrato de `ambientes/tipos.ts`, registre em
`AMBIENTES` (`motor.ts`) e na lista `ambientes` (`catalogo.ts`). O painel de portas e gavetas se monta sozinho a partir
das articulações do ambiente.

Regras do simulador: é sempre uma **simulação ilustrativa**, não um projeto executado nem um orçamento. Não acrescentar
preços, medidas garantidas, marcas ou especificações sem confirmação da Nova Era.

### Regras de conteúdo

- Fontes dos dados: endereço e telefone informados pela empresa; telefone e frase confirmados no Instagram
  oficial (`@novaera_planejados`); WhatsApp no mesmo número, pelo link "Fale Conosco" do Linktree oficial
  (`linktr.ee/novaeramarcenaria`), que está na bio do Instagram.
- **Não publicar sem confirmação:** horário de atendimento, ano de fundação, nota e número de avaliações do
  Google, depoimentos, prazos, garantias, condições de pagamento, materiais/marcas e etapas do atendimento.
  Por isso o site não tem horário, seção de processo nem avaliações, e o JSON-LD não tem `aggregateRating`.
- **Fotos:** todas são de ambientes do portfólio da Nova Era, com a marca d'água original. Recortes
  (abertura e detalhes) usam só enquadramentos da própria foto; nada foi gerado ou retocado.
- **Vídeos:** dois trechos curtos dos reels da empresa, sem som (a música dos originais foi descartada) e
  recortados entre as sobreposições do Instagram.

## Logo

A logo enviada pela empresa está em `logo/`. As versões do site (miolo para o cabeçalho e selo para o
rodapé) e os ícones da aba são gerados por `scripts/preparar-logo.py`, sem redesenho nem troca de cor.
Detalhes em `src/assets/logo/LEIA-ME.md`.

## Fluxo de entrega: local → GitHub → Vercel

**Nada foi enviado nem publicado.** Cada etapa abaixo depende de autorização.

> O Git desta pasta tem histórico próprio da Nova Era (iniciado em 29/10/2026) e **ainda não tem remoto**.
> Quando houver um repositório da Nova Era no GitHub, adicione-o com
> `git remote add origin https://github.com/USUARIO/NOVO-REPOSITORIO.git`.

### O que vai para o repositório

O `.gitignore` deixa de fora dependências, builds, variáveis de ambiente, configurações locais e o
**material bruto** (`fotos e videos/`, `empresa/`). O site usa as versões tratadas em `src/assets/` e
`public/`. Guarde o material bruto em backup próprio.

`.gitattributes` padroniza os fins de linha (o Windows e o Linux da Vercel ficam iguais), e `.nvmrc` e
`engines` fixam o Node 24.

### 1. GitHub (quando autorizado)

Criar um repositório **vazio** no GitHub para a Nova Era (sem README, licença ou `.gitignore`), adicionar
o `origin` como acima e enviar com `git push -u origin main`. Esta pasta fica no OneDrive: se a
sincronização causar conflitos na pasta `.git`, pause o OneDrive durante os commits.

### 2. Vercel (quando autorizado)

1. Na Vercel: **Add New → Project → Import Git Repository** e escolher o repositório.
2. A Vercel detecta o Astro e lê o `vercel.json`: instala com `npm ci`, roda `npm run build` e publica
   `dist/`.
3. Não é preciso nenhuma variável de ambiente para o primeiro deploy.

### 3. Depois que o domínio próprio for definido

1. Em **Settings → Domains**, adicionar o domínio e seguir as instruções de DNS da Vercel.
2. Em **Settings → Environment Variables**, criar `SITE_URL` com o endereço completo no ambiente
   **Production** e fazer um novo deploy. Com `SITE_URL`, o site passa a gerar URL canônica, Open Graph
   com endereço absoluto e `sitemap-index.xml`.

## Créditos de terceiros

- Fonte: Jost (SIL Open Font License), via Fontsource.
- Lâminas de madeira do simulador: [Poly Haven](https://polyhaven.com) (`oak_veneer_01`, `teak_veneer`,
  `american_walnut_veneer`), licença CC0. As demais texturas são procedurais (`scripts/gerar-texturas.py`).
- Bibliotecas: Astro, GSAP (com SplitText e ScrollTrigger), Lenis, three.js.
