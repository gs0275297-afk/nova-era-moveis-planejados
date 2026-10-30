import type Lenis from 'lenis';
import { iniciarMovimento, iniciarMovimentoSuave } from './movimento';
import { iniciarLightbox } from './lightbox';
import { iniciarFormulario } from './formulario';
import { iniciarGaleria } from './galeria';
import { iniciarDetalhes } from './detalhes';
import { iniciarSimulador } from './simulador';
import { iniciarBarraMovel, iniciarCabecalho, iniciarMapa, iniciarMenu, iniciarOpcaoMovimento, iniciarVideos } from './interface';
import { $, movimentoReduzido } from './util';

const raiz = document.documentElement;
const estado = { menuAberto: false };

let lenis: Lenis | null = null;
try {
  if (movimentoReduzido()) iniciarMovimentoSuave();
  else lenis = iniciarMovimento();
} catch (erro) {
  console.warn('Animações desativadas:', erro);
  raiz.classList.add('motion-falhou');
}

/** Navegação interna com rolagem suave. */
function navegar(hash: string) {
  const alvo = $(hash);
  if (!alvo) return;
  if (lenis) lenis.scrollTo(alvo, { duration: 1.4 });
  else alvo.scrollIntoView({ behavior: movimentoReduzido() ? 'auto' : 'smooth' });
  history.replaceState(null, '', hash === '#inicio' ? location.pathname : hash);
}

document.addEventListener('click', (e) => {
  const link = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
  if (!link || link.hasAttribute('data-menu-link')) return;
  const hash = link.getAttribute('href');
  if (!hash || hash === '#') return;
  e.preventDefault();
  navegar(hash);
  // Leva o foco junto para quem navega pelo teclado.
  const alvo = $(hash);
  if (alvo && e.detail === 0) {
    alvo.setAttribute('tabindex', '-1');
    alvo.focus({ preventScroll: true });
  }
});

iniciarCabecalho(estado);
iniciarMenu(lenis, estado, navegar);
iniciarLightbox(lenis);
iniciarFormulario();
iniciarVideos();
iniciarMapa();
iniciarGaleria();
iniciarDetalhes();
iniciarSimulador(lenis);
iniciarBarraMovel();
iniciarOpcaoMovimento();

raiz.classList.add('motion-ok');
