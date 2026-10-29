import { $, $$, desktop, ponteiroFino } from './util';

/**
 * Detalhes: no computador, a lista troca a mídia do palco (passar o mouse, focar ou clicar).
 * A mídia que sai fica inteira por baixo enquanto a nova é revelada por cima (ver Detalhes.astro).
 */
export function iniciarDetalhes() {
  const lista = $('[data-detalhes-lista]');
  if (!lista) return;
  const itens = $$<HTMLElement>('[data-detalhe]', lista);
  let atual = itens.find((i) => i.classList.contains('is-ativo')) ?? itens[0];
  let limpeza = 0;

  const ativar = (item: HTMLElement) => {
    if (item === atual) return;
    const anterior = atual;
    window.clearTimeout(limpeza);
    itens.forEach((i) => i.classList.toggle('is-saindo', i === anterior));
    anterior.classList.remove('is-ativo');
    item.classList.add('is-ativo');
    atual = item;
    itens.forEach((i) => i.querySelector('[data-detalhe-botao]')?.setAttribute('aria-pressed', String(i === item)));
    limpeza = window.setTimeout(() => anterior.classList.remove('is-saindo'), 950);
    document.dispatchEvent(new CustomEvent('detalhes:troca'));
  };

  itens.forEach((item) => {
    const botao = item.querySelector<HTMLButtonElement>('[data-detalhe-botao]');
    if (!botao) return;
    botao.addEventListener('click', () => ativar(item));
    botao.addEventListener('focus', () => desktop() && ativar(item));
    if (ponteiroFino()) botao.addEventListener('pointerenter', () => desktop() && ativar(item));
  });
}
