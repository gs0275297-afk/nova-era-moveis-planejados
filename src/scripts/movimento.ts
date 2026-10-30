import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';

import { $, $$, ponteiroFino } from './util';

gsap.registerPlugin(ScrollTrigger, SplitText);
// Sem "amortecer" atrasos: em abas que estavam em segundo plano, as entradas terminam de imediato.
gsap.ticker.lagSmoothing(0);
ScrollTrigger.config({ ignoreMobileResize: true });
// Só em desenvolvimento: permite avançar as animações à mão em testes com a janela em segundo plano.
if (import.meta.env.DEV) Object.assign(window, { __gsap: gsap, __ScrollTrigger: ScrollTrigger });

/*
 * Linguagem de movimento: cada elemento tem um papel, e nada se repete em tudo.
 * - abertura: a foto se abre do centro como um vão, o título sobe linha a linha e, na rolagem,
 *   a câmera desce do forro até a mesa; depois a apresentação sobe por cima da foto parada;
 * - frase da Nova Era: as palavras acendem conforme a leitura avança, e as miniaturas se abrem;
 * - capítulos dos projetos: cada foto entra por uma máscara numa direção própria, e o fundo da
 *   seção muda de cor com o capítulo em foco;
 * - galeria: sem máscara, só um assentamento curto (são muitas fotos, o movimento não pode cansar);
 * - panorama: o quadro se abre até as bordas da tela;
 * - títulos: linhas sobem dentro de máscaras. Textos de apoio: esmaecimento curto.
 */

/*
 * Entradas que tocam uma vez SEM "once: true": um gatilho "once" se destrói ao disparar e, se isso
 * acontece durante o refresh de outro gatilho (página recarregada já rolada), o ScrollTrigger perde
 * o índice da lista interna e lança erro. Aqui os gatilhos ficam e cada elemento entra uma vez só.
 */
const primeiraVez = (lote: Element[]) =>
  lote.filter((el) => {
    const h = el as HTMLElement;
    if (h.dataset.revelado) return false;
    h.dataset.revelado = '1';
    return true;
  });

/**
 * Rolagem suave só com mouse (no toque, a rolagem nativa é a melhor). O laço só roda enquanto há
 * rolagem acontecendo: com a página parada, nenhum quadro é processado à toa.
 */
function rolagemSuave(): Lenis | null {
  if (!ponteiroFino()) return null;
  const lenis = new Lenis({ lerp: 0.12, wheelMultiplier: 0.9, autoRaf: false });
  lenis.on('scroll', ScrollTrigger.update);

  let rodando = false;
  let parados = 0;
  const quadro = (t: number) => {
    lenis.raf(t);
    parados = lenis.isScrolling ? 0 : parados + 1;
    if (parados > 20) {
      rodando = false;
      return;
    }
    requestAnimationFrame(quadro);
  };
  const acordar = () => {
    parados = 0;
    if (rodando) return;
    rodando = true;
    lenis.time = 0; // sem isto, o primeiro quadro depois de parado salta direto para o destino
    requestAnimationFrame(quadro);
  };
  lenis.on('virtual-scroll', acordar);
  // scrollTo e start/stop (menu, visualizador) também precisam do laço
  const scrollTo = lenis.scrollTo.bind(lenis);
  lenis.scrollTo = (...args: Parameters<Lenis['scrollTo']>) => {
    acordar();
    return scrollTo(...args);
  };
  return lenis;
}

/** Rolagem suave + todas as animações. Só é chamado quando o usuário aceita movimento. */
export function iniciarMovimento(): Lenis | null {
  const lenis = rolagemSuave();

  hero();
  parallaxInterno();
  fundosDosCapitulos();
  panorama();
  if (ponteiroFino()) {
    magneticos();
    cursor();
    previaDoIndice();
  }
  // Títulos e frases dependem das fontes para quebrar as linhas no lugar certo (sem esperar demais).
  Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 900))]).then(() => {
    revelacoes();
    frase();
    ScrollTrigger.refresh();
  });
  return lenis;
}

/**
 * Versão para quem pediu menos movimento ao sistema: nada se desloca, escala ou acompanha o cursor.
 * O conteúdo surge com esmaecimentos curtos, e a cor de fundo dos capítulos continua mudando.
 */
export function iniciarMovimentoSuave() {
  const surgir = (alvos: gsap.TweenTarget, extra: gsap.TweenVars = {}) =>
    gsap.fromTo(alvos, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.7, ease: 'power1.out', ...extra });

  gsap
    .timeline()
    .add(surgir('[data-hero-titulo]'), 0.05)
    .add(surgir('[data-hero-item]', { stagger: 0.06 }), 0.15);

  ScrollTrigger.batch('[data-revelar]', {
    start: 'top 92%',
    once: true,
    onEnter: (lote) => surgir(primeiraVez(lote), { stagger: 0.05, overwrite: true }),
  });
  fundosDosCapitulos();
}

/* ---------- Abertura ---------- */
function hero() {
  const secao = $('[data-hero]');
  const palco = $('[data-hero-palco]');
  const quadro = $('[data-hero-foto]');
  const movel = $('[data-hero-movel]');
  const img = movel?.querySelector('img');
  const titulo = $('[data-hero-titulo]');
  if (!secao || !palco || !quadro || !movel || !img || !titulo) return;

  // Entrada rápida: não espera nada. Em até 1,5 s está tudo no lugar e a página nunca fica bloqueada.
  const tl = gsap.timeline();
  tl.fromTo(
    quadro,
    { clipPath: 'inset(0% 40% 0% 40%)' },
    // ao terminar, "none" em vez de só limpar: o estilo inicial no CSS voltaria a valer e fecharia o quadro
    { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.2, ease: 'expo.inOut', onComplete: () => void (quadro.style.clipPath = 'none') },
    0,
  );
  tl.fromTo(img, { scale: 1.09 }, { scale: 1, duration: 1.7, ease: 'expo.out' }, 0);
  SplitText.create(titulo, {
    type: 'lines',
    mask: 'lines',
    linesClass: 'linha',
    autoSplit: true,
    onSplit(self) {
      gsap.set(titulo, { visibility: 'visible' });
      // Devolve só a animação das linhas: se as fontes chegarem depois, o SplitText refaz a divisão e
      // reverte o que recebeu aqui. Devolver a linha do tempo inteira desfaria também a abertura da foto.
      return gsap.from(self.lines, { yPercent: 112, duration: 1, delay: 0.3, ease: 'expo.out', stagger: 0.08 });
    },
  });
  tl.fromTo('[data-hero-item]', { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.06 }, 0.6);
  tl.from('.topo__barra > *', { autoAlpha: 0, y: -10, duration: 0.7, ease: 'power3.out', stagger: 0.05, clearProps: 'all' }, 0.55);

  // Rolagem: a câmera desce pela foto; título e chamada saem antes de ela chegar à mesa.
  gsap
    .timeline({
      scrollTrigger: {
        trigger: secao,
        start: 'top top',
        end: () => `+=${window.innerHeight * 1.1}`,
        scrub: true,
        invalidateOnRefresh: true,
      },
    })
    .to(movel, { y: () => -(movel.offsetHeight - palco.offsetHeight), ease: 'none', duration: 1 }, 0)
    .to('[data-hero-texto]', { y: () => -window.innerHeight * 0.24, autoAlpha: 0, ease: 'power1.in', duration: 0.42 }, 0)
    .to('[data-hero-base]', { y: () => -window.innerHeight * 0.1, autoAlpha: 0, ease: 'power1.in', duration: 0.3 }, 0)
    .fromTo('[data-hero-legenda]', { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.2, ease: 'power2.out' }, 0.78);

  // Mouse: uma luz quente acompanha o cursor e a foto responde de leve.
  if (ponteiroFino()) {
    const luz = $('[data-hero-luz]');
    const fotoX = gsap.quickTo(img, 'x', { duration: 1.4, ease: 'power3.out' });
    const luzX = luz ? gsap.quickTo(luz, 'x', { duration: 0.9, ease: 'power3.out' }) : null;
    const luzY = luz ? gsap.quickTo(luz, 'y', { duration: 0.9, ease: 'power3.out' }) : null;
    palco.addEventListener('pointermove', (e) => {
      fotoX((e.clientX / window.innerWidth - 0.5) * -22);
      luz?.classList.add('is-acesa');
      luzX?.(e.clientX);
      luzY?.(e.clientY);
    });
    palco.addEventListener('pointerleave', () => {
      fotoX(0);
      luz?.classList.remove('is-acesa');
    });
  }
}

/* ---------- Frase de apresentação: palavras acendem com a rolagem, miniaturas se abrem ---------- */
function frase() {
  const el = $('[data-frase]');
  if (!el) return;
  // Só palavras: a divisão não depende da largura, então não é refeita no redimensionamento
  // (refazer criaria um ScrollTrigger no meio de um refresh, o que o GSAP não aceita).
  const palavras = $$('[data-frase-texto]', el).flatMap((parte) => SplitText.create(parte, { type: 'words', wordsClass: 'palavra' }).words);
  const miniaturas = $$('.manifesto__mini', el);
  const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 78%', end: 'bottom 52%', scrub: 0.5 } });
  tl.fromTo(palavras, { color: 'rgb(246 243 237 / 0.2)' }, { color: 'rgb(246 243 237 / 1)', ease: 'none', stagger: 0.1, duration: 0.3 }, 0);
  miniaturas.forEach((m, i) => {
    tl.fromTo(m, { clipPath: 'inset(0% 50% 0% 50%)' }, { clipPath: 'inset(0% 0% 0% 0%)', ease: 'power2.out', duration: 0.35 }, 0.15 + i * 0.3);
  });
}

/* ---------- Revelações na rolagem ---------- */
function revelacoes() {
  ScrollTrigger.batch('[data-revelar="fade"]', {
    start: 'top 92%',
    once: true,
    onEnter: (lote) =>
      gsap.fromTo(primeiraVez(lote), { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.06, overwrite: true, clearProps: 'transform' }),
  });

  $$('[data-revelar="linhas"]').forEach((el) => {
    SplitText.create(el, {
      type: 'lines',
      mask: 'lines',
      linesClass: 'linha',
      autoSplit: true,
      onSplit(self) {
        gsap.set(el, { visibility: 'visible' });
        return gsap.from(self.lines, {
          yPercent: 112,
          duration: 1.1,
          ease: 'expo.out',
          stagger: 0.08,
          scrollTrigger: { trigger: el, start: 'top 90%', toggleActions: 'play none none none' },
        });
      },
    });
  });

  // Fotos dos capítulos: cada uma entra por uma direção, com um leve recuo de escala.
  const mascaras: Record<string, string> = {
    baixo: 'inset(100% 0% 0% 0%)',
    esquerda: 'inset(0% 100% 0% 0%)',
    direita: 'inset(0% 0% 0% 100%)',
    centro: 'inset(0% 42% 0% 42%)',
  };
  $$('[data-revelar="mascara"]').forEach((el) => {
    const inicio = mascaras[el.dataset.direcao ?? 'baixo'] ?? mascaras.baixo;
    const interno = el.firstElementChild;
    gsap.set(el, { autoAlpha: 1, clipPath: inicio });
    const tl = gsap.timeline({ scrollTrigger: { trigger: el.parentElement, start: 'top 86%', toggleActions: 'play none none none' } });
    tl.to(el, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.3, ease: 'expo.inOut', onComplete: () => void (el.style.clipPath = 'none') });
    if (interno) tl.from(interno, { scale: 1.14, duration: 1.8, ease: 'expo.out', clearProps: 'transform' }, 0.05);
  });
}

/* ---------- Foto que desliza dentro do próprio quadro ---------- */
function parallaxInterno() {
  $$('[data-parallax]').forEach((el) => {
    gsap.fromTo(el, { yPercent: -5 }, { yPercent: 5, ease: 'none', scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
}

/* ---------- O fundo dos projetos muda com o capítulo em foco ---------- */
function fundosDosCapitulos() {
  const secao = $('[data-projetos]');
  if (!secao) return;
  $$('[data-capitulo]', secao).forEach((cap) => {
    ScrollTrigger.create({
      trigger: cap,
      start: 'top 62%',
      end: 'bottom 62%',
      onToggle: (self) => {
        if (self.isActive) secao.dataset.fundo = cap.dataset.capitulo;
      },
    });
  });
}

/* ---------- Panorama: o quadro se abre até as bordas da tela ---------- */
function panorama() {
  const quadro = $('[data-panorama-quadro]');
  if (!quadro) return;
  gsap.fromTo(
    quadro,
    { clipPath: 'inset(9% 8% 9% 8%)' },
    { clipPath: 'inset(0% 0% 0% 0%)', ease: 'none', scrollTrigger: { trigger: quadro, start: 'top 95%', end: 'top 25%', scrub: true } },
  );
}

/* ---------- Índice de ambientes: a prévia acompanha o ponteiro na vertical, de leve ---------- */
function previaDoIndice() {
  const lista = $('[data-indice]');
  if (!lista || !window.matchMedia('(min-width: 1280px)').matches) return;
  const previas = $$('[data-indice-previa]', lista);
  const movers = previas.map((p) => gsap.quickTo(p, 'y', { duration: 0.8, ease: 'power3.out' }));
  lista.addEventListener('pointermove', (e) => {
    const r = lista.getBoundingClientRect();
    const y = ((e.clientY - r.top) / r.height - 0.5) * 24;
    movers.forEach((m) => m(y));
  });
}

/* ---------- Botões magnéticos (somente mouse) ---------- */
function magneticos() {
  $$('[data-magnetico]').forEach((el) => {
    const x = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' });
    const y = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      x(gsap.utils.clamp(-10, 10, (e.clientX - (r.left + r.width / 2)) * 0.22));
      y(gsap.utils.clamp(-8, 8, (e.clientY - (r.top + r.height / 2)) * 0.3));
    });
    el.addEventListener('pointerleave', () => {
      x(0);
      y(0);
    });
  });
}

/* ---------- Cursor com rótulo sobre as fotos ---------- */
function cursor() {
  const seguidor = $('[data-cursor-seguidor]');
  const texto = $('[data-cursor-texto]');
  if (!seguidor || !texto) return;
  const x = gsap.quickTo(seguidor, 'x', { duration: 0.45, ease: 'power3.out' });
  const y = gsap.quickTo(seguidor, 'y', { duration: 0.45, ease: 'power3.out' });

  // Só aparece depois que o mouse se mexe (evita o rótulo parado no canto da tela).
  let mexeu = false;
  window.addEventListener(
    'pointermove',
    (e) => {
      mexeu = true;
      x(e.clientX);
      y(e.clientY);
    },
    { passive: true },
  );
  document.addEventListener('pointerover', (e) => {
    const alvo = mexeu ? (e.target as Element).closest<HTMLElement>('[data-cursor]') : null;
    if (alvo) {
      texto.textContent = alvo.dataset.cursor ?? '';
      seguidor.classList.add('is-ativo');
    } else {
      seguidor.classList.remove('is-ativo');
    }
  });
}

export { gsap, ScrollTrigger };
