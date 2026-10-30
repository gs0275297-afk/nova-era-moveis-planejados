export const $ = <T extends Element = HTMLElement>(sel: string, raiz: ParentNode = document) =>
  raiz.querySelector<T>(sel);

export const $$ = <T extends Element = HTMLElement>(sel: string, raiz: ParentNode = document) =>
  Array.from(raiz.querySelectorAll<T>(sel));

// A classe é definida no <head> (Base.astro), antes de qualquer pintura.
export const movimentoReduzido = () => document.documentElement.classList.contains('reduzido');

export const ponteiroFino = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

export const desktop = () => window.matchMedia('(min-width: 1024px)').matches;

/** Espera uma animação terminar, com limite: abas em segundo plano podem congelar a linha do tempo. */
export const aoTerminar = (animacao: Animation, limiteMs: number) =>
  Promise.race([animacao.finished.catch(() => undefined), new Promise((r) => setTimeout(r, limiteMs))]);

/** Cria um IntersectionObserver e guarda a referência (não depende da coleta de lixo do navegador). */
const observadores: IntersectionObserver[] = [];
export function observar(callback: IntersectionObserverCallback, opcoes?: IntersectionObserverInit) {
  const o = new IntersectionObserver(callback, opcoes);
  observadores.push(o);
  return o;
}
