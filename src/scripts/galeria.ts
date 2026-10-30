import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { $, $$, aoTerminar, movimentoReduzido } from './util';

/** Filtro dos projetos por ambiente: mostra só as séries daquela categoria. */
export function iniciarGaleria() {
  const secao = $('[data-projetos]');
  if (!secao) return;
  const botoes = $$<HTMLButtonElement>('[data-filtro]', secao);
  const series = $$<HTMLElement>('[data-categoria]', secao);
  const status = $('[data-filtro-status]', secao);

  const aplicar = (filtro: string) => {
    let total = 0;
    series.forEach((serie) => {
      const mostrar = filtro === 'todos' || serie.dataset.categoria === filtro;
      serie.hidden = !mostrar;
      if (!mostrar) return;
      total++;
      // Quem estava fora da tela ainda pode estar esperando a entrada: ao mudar de lugar, aparece já.
      $$<HTMLElement>('[data-revelar]', serie).forEach((el) => {
        el.style.opacity = '1';
        el.style.visibility = 'visible';
        el.style.transform = 'none';
        el.dataset.revelado = '1';
      });
    });
    return total;
  };

  const filtrar = async (filtro: string) => {
    const botao = botoes.find((b) => b.dataset.filtro === filtro);
    if (!botao || botao.getAttribute('aria-pressed') === 'true') return;
    botoes.forEach((b) => b.setAttribute('aria-pressed', String(b === botao)));

    let total = 0;
    if (movimentoReduzido()) {
      total = aplicar(filtro);
    } else if (document.startViewTransition) {
      const transicao = document.startViewTransition(() => {
        total = aplicar(filtro);
      });
      await transicao.updateCallbackDone;
    } else {
      const lista = series.filter((s) => !s.hidden);
      await Promise.all(lista.map((s) => aoTerminar(s.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-in', fill: 'forwards' }), 260)));
      lista.forEach((s) => s.getAnimations().forEach((a) => a.cancel()));
      total = aplicar(filtro);
    }
    if (status) status.textContent = `${total} ${total === 1 ? 'projeto' : 'projetos'}: ${botao.textContent?.trim() ?? ''}`;
    // A altura da lista mudou: recalcula as posições das animações das seções seguintes.
    ScrollTrigger.refresh();
  };

  botoes.forEach((botao) => botao.addEventListener('click', () => filtrar(botao.dataset.filtro ?? 'todos')));
}
