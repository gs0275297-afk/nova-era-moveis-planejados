import type Lenis from 'lenis';
import { $, $$, aoTerminar, desktop, movimentoReduzido } from './util';

/* ---------- Cabeçalho: filete ao rolar, some ao descer, item ativo ---------- */
export function iniciarCabecalho(estado: { menuAberto: boolean }) {
  const topo = $('[data-topo]');
  if (!topo) return;
  let ultimo = window.scrollY;
  let agendado = false;

  const atualizar = () => {
    agendado = false;
    const y = window.scrollY;
    topo.classList.toggle('is-rolado', y > 24);
    const descendo = y > ultimo + 4;
    const subindo = y < ultimo - 4;
    if (descendo && y > window.innerHeight * 0.8 && !estado.menuAberto) topo.classList.add('is-oculto');
    if (subindo || y < 80) topo.classList.remove('is-oculto');
    ultimo = y;
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!agendado) {
        agendado = true;
        requestAnimationFrame(atualizar);
      }
    },
    { passive: true },
  );
  atualizar();

  // Destaque do item de navegação da seção visível.
  const links = $$<HTMLAnchorElement>('[data-nav]');
  const secoes = links
    .map((a) => $(a.getAttribute('href') ?? ''))
    .filter((s): s is HTMLElement => s instanceof HTMLElement);
  const obs = new IntersectionObserver(
    (entradas) => {
      entradas.forEach((ent) => {
        if (!ent.isIntersecting) return;
        links.forEach((a) => a.classList.toggle('is-ativo', a.getAttribute('href') === `#${ent.target.id}`));
      });
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );
  secoes.forEach((s) => obs.observe(s));
}

/* ---------- Menu do celular ---------- */
export function iniciarMenu(lenis: Lenis | null, estado: { menuAberto: boolean }, navegar: (hash: string) => void) {
  const menu = $('[data-menu]');
  const abrir = $<HTMLButtonElement>('[data-menu-abrir]');
  const fechar = $<HTMLButtonElement>('[data-menu-fechar]');
  if (!menu || !abrir || !fechar) return;

  const focaveis = () => $$<HTMLElement>('a[href], button:not([disabled])', menu);

  const animar = (entrando: boolean) => {
    if (movimentoReduzido()) return Promise.resolve();
    const itens = $$('[data-menu-item]', menu);
    const a = menu.animate(
      entrando
        ? [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)' }]
        : [{ clipPath: 'inset(0 0 0% 0)' }, { clipPath: 'inset(0 0 100% 0)' }],
      { duration: entrando ? 700 : 500, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'both' },
    );
    if (entrando) {
      itens.forEach((item, i) =>
        item.animate([{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }], {
          duration: 700,
          delay: 220 + i * 55,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'both',
        }),
      );
    }
    return aoTerminar(a, entrando ? 900 : 700);
  };

  const abrirMenu = () => {
    estado.menuAberto = true;
    menu.hidden = false;
    abrir.setAttribute('aria-expanded', 'true');
    lenis?.stop();
    document.body.style.overflow = 'hidden';
    animar(true);
    requestAnimationFrame(() => focaveis()[1]?.focus());
  };

  const fecharMenu = async (destino?: string) => {
    if (!estado.menuAberto) return;
    estado.menuAberto = false;
    abrir.setAttribute('aria-expanded', 'false');
    await animar(false);
    menu.hidden = true;
    menu.getAnimations().forEach((a) => a.cancel());
    document.body.style.overflow = '';
    lenis?.start();
    if (destino) navegar(destino);
    else abrir.focus();
  };

  abrir.addEventListener('click', abrirMenu);
  fechar.addEventListener('click', () => fecharMenu());
  $$<HTMLAnchorElement>('[data-menu-link]', menu).forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      fecharMenu(a.getAttribute('href') ?? undefined);
    }),
  );

  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      fecharMenu();
    }
    if (e.key === 'Tab') {
      const lista = focaveis();
      const primeiro = lista[0];
      const ultimo = lista[lista.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    }
  });

  window.matchMedia('(min-width: 1024px)').addEventListener('change', (m) => {
    if (m.matches) fecharMenu();
  });
}

/* ---------- Barra de orçamento fixa no celular ---------- */
export function iniciarBarraMovel() {
  const barra = $('[data-barra-movel]');
  const hero = $('.hero');
  const ocultar = [$('#contato'), $('.rodape')].filter((el): el is HTMLElement => !!el);
  if (!barra || !hero) return;

  let passouHero = false;
  const visiveis = new Set<Element>();
  const aplicar = () => {
    const mostrar = passouHero && visiveis.size === 0;
    barra.classList.toggle('is-visivel', mostrar);
    barra.inert = !mostrar;
  };
  new IntersectionObserver(([ent]) => {
    passouHero = !ent.isIntersecting && ent.boundingClientRect.top < 0;
    aplicar();
  }).observe(hero);
  const obs = new IntersectionObserver((entradas) => {
    entradas.forEach((ent) => (ent.isIntersecting ? visiveis.add(ent.target) : visiveis.delete(ent.target)));
    aplicar();
  });
  ocultar.forEach((el) => obs.observe(el));
}

/* ---------- Vídeos: tocam só quando visíveis (e, no palco do computador, só o item ativo) ---------- */
export function iniciarVideos() {
  const reduzido = movimentoReduzido();
  const avaliadores = $$<HTMLVideoElement>('[data-video]').map((video) => {
    const item = video.closest('.detalhe');
    const botao = item?.querySelector<HTMLButtonElement>('[data-video-alternar]');
    let pausadoPeloUsuario = reduzido;
    let visivel = false;

    const marcar = () => {
      const pausado = video.paused;
      item?.classList.toggle('is-pausado', pausado);
      if (botao) {
        const titulo = video.getAttribute('aria-label') ?? 'vídeo';
        botao.setAttribute('aria-label', `${pausado ? 'Reproduzir' : 'Pausar'} vídeo: ${titulo}`);
      }
    };
    const liberado = () => !desktop() || !!item?.classList.contains('is-ativo');
    const avaliar = () => {
      if (visivel && liberado() && !pausadoPeloUsuario && !document.hidden) video.play().catch(() => marcar());
      else if (!video.paused) video.pause();
    };

    video.addEventListener('play', marcar);
    video.addEventListener('pause', marcar);
    marcar();

    const alternar = () => {
      pausadoPeloUsuario = !video.paused;
      if (pausadoPeloUsuario) video.pause();
      else video.play().catch(() => marcar());
    };
    botao?.addEventListener('click', alternar);
    video.addEventListener('click', alternar);

    new IntersectionObserver(
      ([ent]) => {
        visivel = ent.isIntersecting;
        avaliar();
      },
      { threshold: 0.35 },
    ).observe(video);
    document.addEventListener('visibilitychange', avaliar);
    return avaliar;
  });
  document.addEventListener('detalhes:troca', () => avaliadores.forEach((avaliar) => avaliar()));
}

/* ---------- Mapa sob demanda ---------- */
export function iniciarMapa() {
  const mapa = $('[data-mapa]');
  const botao = $('[data-mapa-carregar]');
  const capa = $('[data-mapa-capa]');
  const modelo = $<HTMLTemplateElement>('[data-mapa-template]');
  if (!mapa || !botao || !capa || !modelo) return;
  botao.addEventListener('click', () => {
    const iframe = modelo.content.firstElementChild?.cloneNode(true) as HTMLIFrameElement | undefined;
    if (!iframe) return;
    mapa.prepend(iframe);
    capa.remove();
    iframe.focus();
  });
}
