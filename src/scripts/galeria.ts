import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { $, $$, aoTerminar, movimentoReduzido } from './util';

/** Filtro da galeria por ambiente. As fotos escondidas também saem da navegação do visualizador. */
export function iniciarGaleria() {
  const secao = $('[data-galeria]');
  const grade = $('[data-galeria-grade]');
  if (!secao || !grade) return;
  const botoes = $$<HTMLButtonElement>('[data-filtro]', secao);
  const itens = $$<HTMLElement>('[data-categoria]', grade);
  const status = $('[data-galeria-status]', secao);

  const aplicar = (filtro: string) => {
    let total = 0;
    itens.forEach((item) => {
      const mostrar = filtro === 'todos' || item.dataset.categoria === filtro;
      item.hidden = !mostrar;
      if (mostrar) total++;
    });
    return total;
  };

  botoes.forEach((botao) =>
    botao.addEventListener('click', async () => {
      if (botao.getAttribute('aria-pressed') === 'true') return;
      const filtro = botao.dataset.filtro ?? 'todos';
      botoes.forEach((b) => b.setAttribute('aria-pressed', String(b === botao)));

      let total: number;
      if (movimentoReduzido()) {
        total = aplicar(filtro);
      } else {
        await aoTerminar(grade.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-in', fill: 'forwards' }), 300);
        total = aplicar(filtro);
        grade.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], {
          duration: 560,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'forwards',
        });
      }
      const nome = botao.firstChild?.textContent?.trim() ?? '';
      if (status) status.textContent = `${total} ${total === 1 ? 'foto' : 'fotos'}: ${nome}`;
      // A altura da grade mudou: recalcula as posições das animações das seções seguintes.
      ScrollTrigger.refresh();
    }),
  );
}
