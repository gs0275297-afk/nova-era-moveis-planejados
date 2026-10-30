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
| `npm run texturas` | refaz as texturas procedurais do simulador e as versões leves (Python com Pillow, NumPy e SciPy) |

O build (`npm run build`) não depende desses scripts nem do material bruto.

Em desenvolvimento, `http://localhost:4321/?movimento-completo` força as animações completas mesmo
quando o sistema pede movimento reduzido. No site publicado, quem tem essa opção ligada no sistema vê
um botão no rodapé para ativar as animações (a escolha fica guardada naquele navegador).

## Direção de arte

"Linha de luz": o que distingue os projetos da Nova Era nas fotos é a madeira recortada por luz embutida.
- **Cor:** fundo escuro como uma sala à noite (`--noite`), gesso quando o ambiente pede claridade (`--gesso`,
  `--areia`) e um único acento, a cor da fita de LED (`--luz`; `--madeira` sobre fundo claro). O azul e o
  vermelho ficam na logo.
- **Tipografia:** Newsreader no corte de display para frases, Jost para informação (eco da logo). A
  Newsreader é gerada por `scripts/preparar-fontes.py` (um peso, só caracteres do português: 11 KB).
- **Composição:** cada seção tem desenho próprio; não há um "cabeçalho de seção" padrão. Fotos mantêm a
  proporção original sempre que possível.
- **Movimento:** cada elemento tem um papel (ver o comentário em `src/scripts/movimento.ts`). Com movimento
  reduzido: esmaecimentos, sem deslocamento, e a abertura vira uma tela inteira estática.

## Onde editar o conteúdo

- `src/data/empresa.ts`: nome, frase da marca, endereço, telefone/WhatsApp, Instagram e mensagem padrão
  do WhatsApp. Só entram dados confirmados.
- `src/data/projetos.ts`: foto da abertura, projetos em destaque, galeria por ambiente (categorias e fotos)
  e itens da seção Detalhes.
- `src/components/`: uma seção por arquivo (Hero, Sobre, Projetos, Galeria, Panorama, Detalhes, Simulador,
  Contato, Rodape), mais Cabecalho, Lightbox, BarraMovel, Logo e Icone.
- `src/styles/global.css`: cores, tipografia, botões e estados de animação.
- `src/scripts/configurador/catalogo.ts`: acabamentos, cores, puxadores, luzes e vistas do simulador 3D.

### Simulador 3D (`src/components/Simulador.astro` + `src/scripts/configurador/`)

| Arquivo | Papel |
|---|---|
| `catalogo.ts` | opções do simulador (sem three.js: a interface usa antes da cena carregar) |
| `estado.ts` | configuração, desfazer, link compartilhável, configurações salvas, resumo |
| `materiais.ts` | biblioteca central de materiais, luzes leves (uniforms), reflexo projetado e carga das texturas |
| `moveis.ts` | peças reutilizáveis: caixas, portas, basculantes, gavetas, puxadores, dobradiças e corrediças |
| `ambientes/` | um módulo por ambiente, com geometria, luzes e vistas próprias (hoje, `cozinha.ts`) |
| `motor.ts` | renderização sob demanda em HDR, refino progressivo, câmera, comparação, captura, descarte |
| `index.ts` | liga o painel ao estado e ao motor |

`src/scripts/simulador.ts` fica no pacote principal e só baixa o three.js quando a pessoa abre o simulador. Até lá, a
seção mostra uma imagem da própria cena (`src/assets/simulador/capa-cozinha.jpg`), capturada do simulador: se a cena
mudar muito, capture de novo com `motor.capturar(1920)`.

**Para adicionar um ambiente:** crie `ambientes/<nome>.ts` que cumpra o contrato de `ambientes/tipos.ts`, registre em
`AMBIENTES` (`motor.ts`) e na lista `ambientes` (`catalogo.ts`). O painel de portas e gavetas se monta sozinho a partir
das articulações do ambiente.

**Como a imagem é feita (decisões vindas de medição, não de gosto):**

- Só o sol é uma luz completa do three.js, com sombra. Spots, pendentes, fitas de LED, sanca e janela são calculados
  em `materiais.ts` e controlados por uniforms: ligar e desligar muda um número. Antes, com 11 luzes reais, cada troca
  recompilava todos os shaders (8 s para acender os spots numa GPU integrada).
- O brilho vem de uma sonda de reflexo da própria sala, com projeção em caixa. Ela é refeita só quando a luz, a
  composição ou um material mudam.
- Em movimento: um quadro em HDR com MSAA e resolução dinâmica, que só cai se a mediana do tempo real entre quadros
  passar de 19 ms ou se um em cada dez quadros passar de 28 ms.
- Parado: refino progressivo, um passo por quadro, que qualquer interação interrompe (antisserrilhado por deslocamento
  de câmera, penumbra por deslocamento do sol, oclusão de ambiente uma vez). Acabado o refino, nada é desenhado.
- As frentes são desenhadas primeiro e as paredes por último (`ORDEM_DESENHO` em `moveis.ts`), e o que fica dentro de uma
  gaveta ou atrás de uma porta fechada nem é desenhado.
- `compileAsync` prepara todas as variantes de shader durante a carga e as texturas vão para a GPU em ocioso.
- Com movimento reduzido no sistema, as vistas se dissolvem em vez de voar, e portas, gavetas e zoom ficam mais curtos.

Em desenvolvimento, `window.__simulador.motor` tem `diagnostico()` (custos reais da GPU), `medirFluidez(ms)`,
`avancarQuadros(n)`, `olhar(pos, mira)` e `_interno()`. Medir com a janela do app visível: atrás de outra janela, o
navegador quase para o `requestAnimationFrame`. Se o sistema pedir movimento reduzido, use `?movimento-completo` para medir
as animações completas.

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
  (abertura e detalhes) usam só enquadramentos da própria foto; nada foi gerado ou retocado. As três fotos de
  borda a borda (`abertura-ampliada`, `jantar-adega-ampla`, `panorama-painel`) foram ampliadas por reamostragem
  clássica, sem IA, porque os originais chegaram com 1179 px de largura. Se a empresa enviar os arquivos sem a
  compressão do WhatsApp, troque em `fotos e videos/` e rode `python scripts/preparar-fotos.py`.
- **Vídeos:** dois trechos curtos dos reels da empresa, sem som (a música dos originais foi descartada) e
  recortados entre as sobreposições do Instagram.

## Logo

A logo enviada pela empresa está em `logo/`. As versões do site (miolo para o cabeçalho e selo para o
rodapé) e os ícones da aba são gerados por `scripts/preparar-logo.py`, sem redesenho nem troca de cor.
Detalhes em `src/assets/logo/LEIA-ME.md`.

## Fluxo de entrega: local → GitHub → Vercel

O repositório está em `https://github.com/gs0275297-afk/nova-era-moveis-planejados`; a Vercel ainda não foi conectada.
Cada envio ou publicação depende de autorização.

### O que vai para o repositório

O `.gitignore` deixa de fora dependências, builds, variáveis de ambiente, configurações locais e o
**material bruto** (`fotos e videos/`, `empresa/`). O site usa as versões tratadas em `src/assets/` e
`public/`. Guarde o material bruto em backup próprio.

`.gitattributes` padroniza os fins de linha (o Windows e o Linux da Vercel ficam iguais), e `.nvmrc` e
`engines` fixam o Node 24.

### 1. GitHub (quando autorizado)

Enviar com `git push origin main`. Esta pasta fica no OneDrive: se a sincronização causar conflitos na pasta
`.git`, pause o OneDrive durante os commits.

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

- Fontes: Jost, via Fontsource, e Newsreader (Production Type), recortada pelo projeto; ambas sob SIL Open Font License.
- Lâminas de madeira do simulador: [Poly Haven](https://polyhaven.com) (`oak_veneer_01`, `teak_veneer`,
  `american_walnut_veneer`), licença CC0. As demais texturas (pedras, piso, gesso, relevos) são procedurais
  (`scripts/gerar-texturas.py`).
- Bibliotecas: Astro, GSAP (com SplitText e ScrollTrigger), Lenis, three.js.
