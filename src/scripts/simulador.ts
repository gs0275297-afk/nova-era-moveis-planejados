import type Lenis from 'lenis';
import type { Configurador } from './configurador/index';
import { $, movimentoReduzido, observar } from './util';

/**
 * Carregador do simulador 3D. Fica no pacote principal e é leve: o three.js e a cena só são
 * baixados quando o simulador vai ser usado.
 * - computador: quando a seção se aproxima da tela;
 * - celular e tablet: quando a pessoa toca em "Abrir simulador" (abre em tela inteira);
 * - link compartilhado (#simulador=...): logo ao abrir a página.
 */
export function iniciarSimulador(lenis: Lenis | null) {
  const raiz = $('[data-sim]');
  if (!raiz) return;
  const grande = () => window.matchMedia('(min-width: 1024px)').matches;
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
    const c = await carregar();
    if (c && !grande()) {
      c.motor.suspender(false);
      c.abrirSobreposto();
    }
  };
  $('[data-sim-abrir]', raiz)?.addEventListener('click', abrir);
  raiz.addEventListener('simulador:fechado', () => {
    if (!grande()) carregando?.then((c) => c?.motor.suspender(true));
  });

  if (location.hash.startsWith('#simulador=')) {
    const secao = raiz.closest('section');
    if (secao) lenis ? lenis.scrollTo(secao, { immediate: true }) : secao.scrollIntoView();
    if (grande()) carregar();
    return;
  }

  // No computador, começa a carregar quando a seção se aproxima (também se a janela crescer depois).
  let vigiando = false;
  const vigiar = () => {
    if (vigiando || !grande()) return;
    vigiando = true;
    const obs = observar(
      ([e]) => {
        if (!e.isIntersecting) return;
        obs.disconnect();
        carregar();
      },
      { rootMargin: '700px 0px' },
    );
    obs.observe(raiz);
  };
  vigiar();
  window.matchMedia('(min-width: 1024px)').addEventListener('change', vigiar);
}
