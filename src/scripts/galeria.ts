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
      if (mostrar) {
        total++;
        // Quem estava fora da tela ainda pode estar esperando a entrada: ao mudar de lugar, aparece já.
        item.style.opacity = '1';
        item.style.visibility = 'visible';
        item.style.transform = 'none';
        item.dataset.revelado = '1';
      }
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
      // As fotos deslizam do lugar antigo para o novo, sem nenhuma animação escrita à mão.
      const transicao = document.startViewTransition(() => {
        total = aplicar(filtro);
      });
      await transicao.updateCallbackDone;
    } else {
      await aoTerminar(grade.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-in', fill: 'forwards' }), 260);
      total = aplicar(filtro);
      grade.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' });
    }
    const nome = botao.firstChild?.textContent?.trim() ?? '';
    if (status) status.textContent = `${total} ${total === 1 ? 'foto' : 'fotos'}: ${nome}`;
    // A altura da grade mudou: recalcula as posições das animações das seções seguintes.
    ScrollTrigger.refresh();
  };

  botoes.forEach((botao) => botao.addEventListener('click', () => filtrar(botao.dataset.filtro ?? 'todos')));

  // Índice de ambientes da apresentação: o link leva à galeria já filtrada.
  $$<HTMLAnchorElement>('[data-filtrar]').forEach((link) => link.addEventListener('click', () => filtrar(link.dataset.filtrar ?? 'todos')));
}
