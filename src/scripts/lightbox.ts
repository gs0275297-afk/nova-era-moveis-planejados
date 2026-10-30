import type Lenis from 'lenis';
import { $, $$, aoTerminar, movimentoReduzido } from './util';

interface FotoAmpliada {
  src: string;
  largura: number;
  altura: number;
  alt: string;
  ambiente: string;
  legenda?: string;
}

/**
 * Visualizador de fotos: abre a partir da miniatura (FLIP), teclado, setas e gesto de arrastar.
 * Navega só entre as fotos do mesmo grupo (projetos ou galeria) que estão visíveis,
 * então o filtro de ambiente da galeria vale também aqui.
 */
export function iniciarLightbox(lenis: Lenis | null) {
  const dialogo = $<HTMLDialogElement>('[data-lightbox]');
  const img = $<HTMLImageElement>('[data-lightbox-img]');
  const dados = $('[data-lightbox-dados]');
  if (!dialogo || !img || !dados) return;

  const fotos: FotoAmpliada[] = JSON.parse(dados.textContent ?? '[]');
  const atual = $('[data-lightbox-atual]', dialogo);
  const total = $('[data-lightbox-total]', dialogo);
  const ambiente = $('[data-lightbox-ambiente]', dialogo);
  const legenda = $('[data-lightbox-legenda]', dialogo);
  const navegacao = $$<HTMLButtonElement>('[data-lightbox-anterior], [data-lightbox-proximo]', dialogo);
  const botoes = $$<HTMLButtonElement>('[data-lightbox-abrir]');
  let sequencia: number[] = [];
  let posicao = 0;

  const mostrar = (p: number) => {
    posicao = (p + sequencia.length) % sequencia.length;
    const f = fotos[sequencia[posicao]];
    img.src = f.src;
    img.alt = f.alt;
    img.width = f.largura;
    img.height = f.altura;
    if (atual) atual.textContent = String(posicao + 1);
    if (total) total.textContent = String(sequencia.length);
    if (ambiente) ambiente.textContent = f.ambiente;
    if (legenda) legenda.textContent = f.legenda ?? f.alt;
    // pré-carrega as vizinhas
    [posicao + 1, posicao - 1].forEach((v) => {
      const vizinha = new Image();
      vizinha.src = fotos[sequencia[(v + sequencia.length) % sequencia.length]].src;
    });
  };

  const trocar = (passo: number) => {
    if (sequencia.length < 2) return;
    if (movimentoReduzido()) return mostrar(posicao + passo);
    const saida = img.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${passo * -24}px)` }],
      { duration: 180, easing: 'ease-in' },
    );
    aoTerminar(saida, 300).then(() => {
        mostrar(posicao + passo);
        img.animate([{ opacity: 0, transform: `translateX(${passo * 24}px)` }, { opacity: 1, transform: 'none' }], {
          duration: 420,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        });
      });
  };

  const abrir = (origem: HTMLButtonElement) => {
    const grupo = origem.dataset.lightboxGrupo;
    sequencia = botoes
      .filter((b) => b.dataset.lightboxGrupo === grupo && !b.closest('[hidden]'))
      .map((b) => Number(b.dataset.lightboxAbrir));
    navegacao.forEach((b) => (b.hidden = sequencia.length < 2));
    img.loading = 'eager';
    mostrar(Math.max(0, sequencia.indexOf(Number(origem.dataset.lightboxAbrir))));
    lenis?.stop();
    dialogo.showModal();
    if (movimentoReduzido()) return;

    // FLIP: a foto cresce a partir da miniatura clicada.
    const de = origem.getBoundingClientRect();
    const executar = () => {
      const para = img.getBoundingClientRect();
      if (!para.width || !de.width) return;
      const escala = Math.max(de.width / para.width, de.height / para.height);
      img.animate(
        [
          {
            transform: `translate(${de.left - para.left}px, ${de.top - para.top}px) scale(${escala})`,
            clipPath: `inset(0 ${Math.max(0, para.width * escala - de.width) / escala}px ${Math.max(0, para.height * escala - de.height) / escala}px 0)`,
          },
          { transform: 'none', clipPath: 'inset(0 0 0 0)' },
        ],
        { duration: 760, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
      dialogo.animate([{ backgroundColor: 'rgb(13 15 20 / 0)' }, { backgroundColor: 'rgb(13 15 20 / 0.97)' }], {
        duration: 500,
        easing: 'ease-out',
      });
    };
    if (img.complete && img.naturalWidth) requestAnimationFrame(executar);
    else img.addEventListener('load', () => requestAnimationFrame(executar), { once: true });
  };

  const fechar = () => {
    if (movimentoReduzido()) return dialogo.close();
    const saida = dialogo.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-in' });
    aoTerminar(saida, 400).then(() => {
      dialogo.close();
      saida.cancel();
    });
  };

  dialogo.addEventListener('close', () => lenis?.start());
  dialogo.addEventListener('cancel', (e) => {
    e.preventDefault();
    fechar();
  });

  botoes.forEach((botao) => botao.addEventListener('click', () => abrir(botao)));
  $('[data-lightbox-fechar]', dialogo)?.addEventListener('click', fechar);
  $('[data-lightbox-anterior]', dialogo)?.addEventListener('click', () => trocar(-1));
  $('[data-lightbox-proximo]', dialogo)?.addEventListener('click', () => trocar(1));

  dialogo.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') trocar(1);
    if (e.key === 'ArrowLeft') trocar(-1);
  });

  // Clique fora da foto fecha.
  dialogo.addEventListener('click', (e) => {
    if (e.target === dialogo || (e.target as HTMLElement).classList.contains('lightbox__figura')) fechar();
  });

  // Arrastar para os lados no toque.
  let inicioX = 0;
  let inicioY = 0;
  img.addEventListener('pointerdown', (e) => {
    inicioX = e.clientX;
    inicioY = e.clientY;
  });
  img.addEventListener('pointerup', (e) => {
    const dx = e.clientX - inicioX;
    const dy = e.clientY - inicioY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) trocar(dx < 0 ? 1 : -1);
  });
}
