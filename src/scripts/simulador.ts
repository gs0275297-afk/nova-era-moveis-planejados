import type Lenis from 'lenis';
import type { Configurador } from './configurador/index';
import { $, movimentoReduzido } from './util';

/**
 * Carregador do simulador 3D. Fica no pacote principal e é leve: o three.js e a cena só são
 * baixados por intenção do visitante.
 * - até lá, a seção mostra só uma imagem da própria cena (capa);
 * - apontar para o botão já adianta o download do código, para a abertura parecer imediata;
 * - computador: a cena abre no lugar da capa. Celular e tablet: abre em tela inteira;
 * - link compartilhado (#simulador=...): carrega logo ao abrir a página.
 */
export function iniciarSimulador(lenis: Lenis | null) {
  const raiz = $('[data-sim]');
  if (!raiz) return;
  const grande = () => window.matchMedia('(min-width: 1024px)').matches;
  const moldura = raiz.closest('section') ?? raiz;
  let carregando: Promise<Configurador | null> | null = null;

  const carregar = () =>
    (carregando ??= import('./configurador/index')
      .then((m) => m.iniciarConfigurador(raiz, { lenis, reduzido: movimentoReduzido() }))
      .then((c) => {
        // fora do modo tela inteira, no celular a capa cobre a cena: nada é desenhado por baixo
        if (c && !grande()) c.motor.suspender(true);
        // só em desenvolvimento: acesso para conferência (estatísticas, estado)
        if (import.meta.env.DEV) (window as unknown as { __simulador: unknown }).__simulador = c;
        return c;
      })
      .catch((erro) => {
        console.warn('Simulador 3D indisponível:', erro);
        raiz.dataset.estado = 'erro';
        $('[data-sim-erro]', raiz)!.hidden = false;
        return null;
      }));

  const abrir = async () => {
    if (grande()) {
      // no computador, a cena ocupa a tela: traz a moldura inteira para a vista
      if (lenis) lenis.scrollTo(raiz, { duration: 0.9 });
      else raiz.scrollIntoView({ behavior: movimentoReduzido() ? 'auto' : 'smooth' });
    }
    const c = await carregar();
    if (c && !grande()) {
      c.motor.suspender(false);
      c.abrirSobreposto();
    }
  };

  const botao = $('[data-sim-abrir]', raiz);
  botao?.addEventListener('click', abrir);
  // Adianta só o código (a cena continua esperando o clique): apontar é quase sempre o prelúdio do clique.
  const adiantar = () => void import('./configurador/index').catch(() => undefined);
  botao?.addEventListener('pointerenter', adiantar, { once: true });
  botao?.addEventListener('focus', adiantar, { once: true });

  raiz.addEventListener('simulador:fechado', () => {
    if (!grande()) carregando?.then((c) => c?.motor.suspender(true));
  });

  if (location.hash.startsWith('#simulador=')) {
    if (lenis) lenis.scrollTo(moldura, { immediate: true });
    else moldura.scrollIntoView();
    if (grande()) carregar();
  }
}
