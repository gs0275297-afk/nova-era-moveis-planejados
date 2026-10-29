import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';

import { $, $$, ponteiroFino } from './util';

gsap.registerPlugin(ScrollTrigger, SplitText);
// Sem "amortecer" atrasos: em abas que estavam em segundo plano, as entradas terminam de imediato.
gsap.ticker.lagSmoothing(0);

/*
 * Linguagem de movimento (cada tipo de elemento tem um papel, nada se repete em tudo):
 * - abertura: o quadro da foto se abre a partir do centro (como um vão), o título sobe linha a
 *   linha e a ficha de contato surge por último; na rolagem a foto desliza dentro do quadro;
 * - frase da Nova Era: palavras ganham cor conforme a leitura avança (rolagem);
 * - fotos dos projetos: máscara de baixo para cima com leve recuo de escala;
 *   a segunda foto de cada projeto tem parallax discreto;
 * - títulos de seção: linhas sobem dentro de máscaras; textos de apoio surgem em sequência.
 */

/** Rolagem suave + todas as animações. Só é chamado quando o usuário aceita movimento. */
export function iniciarMovimento(): Lenis {
  const lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 0.95 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((tempo) => lenis.raf(tempo * 1000));

  // A abertura espera as fontes e a foto principal (com limite), para a máscara revelar a imagem e não um quadro vazio.
  const fotoHero = $<HTMLImageElement>('[data-hero-img] img');
  const prontos = Promise.all([document.fonts.ready, fotoHero?.decode().catch(() => undefined)]);
  Promise.race([prontos, new Promise((r) => setTimeout(r, 1600))]).then(() => {
    hero();
    revelacoes();
    frase();
    ScrollTrigger.refresh();
  });

  parallaxLeve();
  if (ponteiroFino()) {
    magneticos();
    cursor();
  }
  return lenis;
}

/**
 * Versão para quem pediu menos movimento ao sistema: nada se desloca, escala ou
 * acompanha o cursor. O conteúdo apenas surge com esmaecimentos curtos.
 */
export function iniciarMovimentoSuave() {
  const surgir = (alvos: gsap.TweenTarget, extra: gsap.TweenVars = {}) =>
    gsap.fromTo(alvos, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8, ease: 'power1.out', ...extra });

  gsap
    .timeline()
    .add(surgir('[data-hero-titulo]'), 0.1)
    .add(surgir('[data-hero-item]', { stagger: 0.08 }), 0.25);

  ScrollTrigger.batch('[data-revelar]', {
    start: 'top 92%',
    once: true,
    onEnter: (lote) => surgir(lote, { stagger: 0.06, overwrite: true }),
  });
}

/* ---------- Abertura ---------- */
function hero() {
  const secao = $('[data-hero]');
  const quadro = $('[data-hero-foto]');
  const moldura = $('[data-hero-img]');
  const picture = moldura?.querySelector('picture');
  const img = moldura?.querySelector('img');
  const titulo = $('[data-hero-titulo]');
  if (!secao || !titulo) return;

  const tl = gsap.timeline({ defaults: { ease: 'expo.inOut' } });
  if (quadro) tl.to(quadro, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.6 }, 0);
  if (img) tl.fromTo(img, { scale: 1.2 }, { scale: 1, duration: 2.4, ease: 'expo.out' }, 0.05);

  SplitText.create(titulo, {
    type: 'lines',
    mask: 'lines',
    linesClass: 'linha',
    autoSplit: true,
    onSplit(self) {
      gsap.set(titulo, { visibility: 'visible' });
      return tl.from(self.lines, { yPercent: 110, duration: 1.25, ease: 'expo.out', stagger: 0.09 }, 0.35);
    },
  });
  tl.to('[data-hero-item]', { autoAlpha: 1, y: 0, startAt: { y: 16 }, duration: 1, ease: 'expo.out', stagger: 0.07 }, 0.75);

  // Rolagem: a foto desliza dentro do quadro enquanto a abertura sai da tela.
  if (picture) {
    gsap.set(picture, { scale: 1.1 });
    gsap.to(picture, {
      yPercent: 4,
      ease: 'none',
      scrollTrigger: { trigger: secao, start: 'top top', end: 'bottom top', scrub: true },
    });
  }

  // Mouse: a foto acompanha o cursor de leve (a escala do <picture> dá a folga nas bordas).
  if (img && ponteiroFino()) {
    const x = gsap.quickTo(img, 'x', { duration: 1.2, ease: 'power3.out' });
    const y = gsap.quickTo(img, 'y', { duration: 1.2, ease: 'power3.out' });
    secao.addEventListener('pointermove', (e) => {
      x((e.clientX / window.innerWidth - 0.5) * -18);
      y((e.clientY / window.innerHeight - 0.5) * -12);
    });
    secao.addEventListener('pointerleave', () => {
      x(0);
      y(0);
    });
  }
}

/* ---------- Frase de apresentação: palavras acendem com a rolagem ---------- */
function frase() {
  const el = $('[data-frase]');
  if (!el) return;
  // Só palavras: a divisão não depende da largura, então não é refeita no redimensionamento
  // (refazer criaria um ScrollTrigger no meio de um refresh, o que o GSAP não aceita).
  SplitText.create(el, {
    type: 'words',
    wordsClass: 'palavra',
    onSplit(self) {
      const finais = self.words.map((p) => getComputedStyle(p).color);
      return gsap.fromTo(
        self.words,
        { color: 'rgb(190 194 205)' },
        {
          color: (i: number) => finais[i],
          ease: 'none',
          stagger: 0.1,
          scrollTrigger: { trigger: el, start: 'top 82%', end: 'bottom 48%', scrub: 0.6 },
        },
      );
    },
  });
}

/* ---------- Revelações na rolagem ---------- */
function revelacoes() {
  ScrollTrigger.batch('[data-revelar="fade"]', {
    start: 'top 90%',
    once: true,
    onEnter: (lote) =>
      gsap.fromTo(
        lote,
        { autoAlpha: 0, y: 26 },
        { autoAlpha: 1, y: 0, duration: 1, ease: 'expo.out', stagger: 0.08, overwrite: true },
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
          yPercent: 110,
          duration: 1.2,
          ease: 'expo.out',
          stagger: 0.09,
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        });
      },
    });
  });

  // Fotos dos projetos: máscara (de baixo para cima, salvo outra direção) + leve recuo de escala da imagem.
  const mascaras: Record<string, string> = {
    baixo: 'inset(100% 0% 0% 0%)',
    esquerda: 'inset(0% 100% 0% 0%)',
    direita: 'inset(0% 0% 0% 100%)',
  };
  $$('[data-revelar="mascara"]').forEach((el) => {
    const inicio = mascaras[el.dataset.direcao ?? 'baixo'] ?? mascaras.baixo;
    const interno = el.firstElementChild;
    gsap.set(el, { autoAlpha: 1, clipPath: inicio });
    const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 84%', once: true } });
    tl.to(el, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.5, ease: 'expo.inOut' });
    if (interno) tl.from(interno, { scale: 1.25, duration: 2.1, ease: 'expo.out' }, 0.1);
  });
}

/* ---------- Parallax discreto das fotos secundárias (só em telas largas) ---------- */
function parallaxLeve() {
  const mm = gsap.matchMedia();
  mm.add('(min-width: 1024px)', () => {
    $$('[data-parallax-leve]').forEach((el) => {
      gsap.fromTo(
        el,
        { yPercent: 7 },
        { yPercent: -7, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } },
      );
    });
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

/* ---------- Cursor com rótulo sobre as fotos da galeria ---------- */
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
