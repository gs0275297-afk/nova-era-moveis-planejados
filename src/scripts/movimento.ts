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
 * Linguagem de movimento: pouca, e a serviço das fotos.
 * - abertura: a foto se abre do centro como um vão, o título sobe linha a linha e, na rolagem,
 *   a apresentação sobe por cima da foto parada;
 * - frase da Nova Era: as palavras acendem conforme a leitura avança;
 * - títulos de seção: linhas sobem dentro de máscaras;
 * - fotos e textos: esmaecimento com um assentamento curto (são muitas fotos, o movimento não pode cansar).
 */

/*
 * Entradas que tocam uma vez SEM "once: true": um gatilho "once" se destrói ao disparar e, se isso
 * acontece durante o refresh de outro gatilho (página recarregada já rolada), o ScrollTrigger perde
 * o índice da lista interna e lança erro. Aqui os gatilhos ficam e cada elemento entra uma vez só.
 */
const entrarUmaVez = (lote: Element[], animar: (novos: Element[]) => void) => {
  const novos = lote.filter((el) => {
    const h = el as HTMLElement;
    if (h.dataset.revelado) return false;
    h.dataset.revelado = '1';
    return true;
  });
  if (novos.length) animar(novos);
};

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
 * O conteúdo surge com esmaecimentos curtos.
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
    onEnter: (lote) => entrarUmaVez(lote, (novos) => surgir(novos, { stagger: 0.05, overwrite: true })),
  });
}

/* ---------- Abertura ---------- */
function hero() {
  const secao = $('[data-hero]');
  const quadro = $('[data-hero-foto]');
  const img = quadro?.querySelector('img');
  const titulo = $('[data-hero-titulo]');
  if (!secao || !quadro || !img || !titulo) return;

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

  // Rolagem: título e chamada saem antes de a próxima seção cobrir a foto.
  gsap.to('[data-hero-texto]', {
    y: () => -window.innerHeight * 0.08,
    autoAlpha: 0,
    ease: 'power1.in',
    scrollTrigger: { trigger: secao, start: 'top top', end: () => `+=${window.innerHeight * 0.45}`, scrub: true, invalidateOnRefresh: true },
  });
}

/* ---------- Frase de apresentação: as palavras acendem com a rolagem ---------- */
function frase() {
  const el = $('[data-frase]');
  if (!el) return;
  // Só palavras: a divisão não depende da largura, então não é refeita no redimensionamento
  // (refazer criaria um ScrollTrigger no meio de um refresh, o que o GSAP não aceita).
  const palavras = SplitText.create(el, { type: 'words', wordsClass: 'palavra' }).words;
  gsap.fromTo(
    palavras,
    { color: 'rgb(246 243 237 / 0.2)' },
    { color: 'rgb(246 243 237 / 1)', ease: 'none', stagger: 0.1, duration: 0.3, scrollTrigger: { trigger: el, start: 'top 78%', end: 'bottom 52%', scrub: 0.5 } },
  );
}

/* ---------- Revelações na rolagem ---------- */
function revelacoes() {
  ScrollTrigger.batch('[data-revelar="fade"]', {
    start: 'top 92%',
    onEnter: (lote) =>
      entrarUmaVez(lote, (novos) =>
        gsap.fromTo(novos, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.06, overwrite: true, clearProps: 'transform' }),
      ),
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
}

export { gsap, ScrollTrigger };
