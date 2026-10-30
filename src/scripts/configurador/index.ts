import type Lenis from 'lenis';
import { acabamento, idLaca, lerLaca, papeis, type Brilho, type Papel } from './catalogo';
import {
  PADRAO,
  clonar,
  configDoEndereco,
  criarLoja,
  excluirSalva,
  lerSalvas,
  linkDe,
  resumo,
  salvar,
  type Config,
} from './estado';
import { criarMotor, type Motor } from './motor';

/*
 * Interface do simulador: liga o painel (Simulador.astro) ao estado e ao motor 3D.
 * Toda ação visível na interface tem efeito real; nada aqui inventa preço, medida ou prazo.
 */

interface Opcoes {
  lenis: Lenis | null;
  reduzido: boolean;
}

export async function iniciarConfigurador(raiz: HTMLElement, o: Opcoes) {
  const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = raiz) => r.querySelector<T>(s);
  const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = raiz) => Array.from(r.querySelectorAll<T>(s));
  const secao = raiz.closest('section') ?? document.body;
  const palco = $('[data-sim-palco]')!;
  const painel = $('[data-sim-painel]')!;
  const numero = raiz.dataset.whatsapp ?? '';
  const lista = $('[data-sim-articulacoes]')!;
  // o motor avisa mudanças já durante a montagem; a interface só responde depois de pronta
  let interfacePronta = false;

  const toque = window.matchMedia('(hover: none)').matches;
  const memoria = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const leve = toque || memoria <= 4 || window.innerWidth < 768;

  /* ---------- avisos curtos ---------- */
  const aviso = $('[data-sim-aviso]', secao)!;
  let tempoAviso = 0;
  const avisar = (texto: string) => {
    aviso.textContent = texto;
    aviso.classList.add('is-visivel');
    clearTimeout(tempoAviso);
    tempoAviso = window.setTimeout(() => aviso.classList.remove('is-visivel'), 2800);
  };

  /* ---------- motor ---------- */
  raiz.dataset.estado = 'carregando';
  const apontar = $('[data-sim-apontar]')!;
  const selo = $('.sim__selo')!;
  let motor: Motor;
  try {
    motor = criarMotor(
      palco,
      { leve, reduzido: o.reduzido, toque },
      {
        carga: (n) => (selo.textContent = n > 0 ? 'Carregando texturas…' : 'Simulação ilustrativa'),
        articulacoes: () => desenharArticulacoes(),
        apontar: (rotulo) => {
          apontar.hidden = !rotulo;
          apontar.textContent = rotulo ?? '';
        },
        perdeuContexto: () => falhar(),
      },
    );
  } catch (erro) {
    console.warn('Simulador 3D indisponível:', erro);
    falhar();
    return null;
  }

  function falhar() {
    raiz.dataset.estado = 'erro';
    $('[data-sim-erro]')!.hidden = false;
    fecharSobreposto();
  }

  const doLink = configDoEndereco();
  const loja = criarLoja(doLink ?? PADRAO);
  try {
    await motor.carregarAmbiente('cozinha', loja.get());
  } catch (erro) {
    console.warn('Falha ao montar o ambiente:', erro);
    motor.destruir();
    falhar();
    return null;
  }
  raiz.dataset.estado = 'pronto';
  if (doLink) avisar('Simulação carregada a partir do link.');

  /* ---------- estado da interface (não faz parte da configuração) ---------- */
  let papelAlvo: Papel = 'portas';
  let brilhoPreferido: Brilho = lerLaca(loja.get().acabamentos.portas)?.brilho ?? 'fosco';
  let comparando = false;

  loja.ouvir((c, anterior) => {
    motor.aplicar(c, anterior);
    sincronizar();
  });

  const marcar = (el: Element, ligado: boolean, atributo = 'aria-pressed') => el.setAttribute(atributo, String(ligado));
  const brilhoAtual = () => lerLaca(loja.get().acabamentos[papelAlvo])?.brilho ?? brilhoPreferido;

  function sincronizar() {
    const c = loja.get();
    $$('[data-opcao="ilha"]').forEach((b) => marcar(b, (b.dataset.valor === 'sim') === c.composicao.ilha));
    $$('[data-opcao="aereos"]').forEach((b) => marcar(b, b.dataset.valor === c.composicao.aereos));
    $$('[data-opcao="espessura"]').forEach((b) => marcar(b, b.dataset.valor === c.bancada.espessura));
    $$('[data-papel]').forEach((b) => marcar(b, b.dataset.papel === papelAlvo));
    const atual = c.acabamentos[papelAlvo];
    const laca = lerLaca(atual);
    const brilho = brilhoAtual();
    $$('[data-acabamento]:not([data-cor])').forEach((b) => marcar(b, b.dataset.acabamento === atual));
    $$('[data-cor]').forEach((b) => {
      b.dataset.acabamento = idLaca(b.dataset.cor!, brilho);
      marcar(b, laca?.cor === b.dataset.cor);
    });
    $$('[data-brilho]').forEach((b) => marcar(b, b.dataset.brilho === brilho));
    const nomePapel = papeis.find((p) => p.id === papelAlvo)!.nome;
    $$('[data-atual-papel]').forEach((el) => (el.textContent = `${nomePapel}, ${acabamento(atual).nome.toLowerCase()}`));
    $$('[data-puxador]').forEach((b) => marcar(b, b.dataset.puxador === c.puxador.tipo));
    $$<HTMLButtonElement>('[data-metal]').forEach((b) => {
      marcar(b, b.dataset.metal === c.puxador.metal);
    });
    $$('[data-pedra]').forEach((b) => marcar(b, b.dataset.pedra === c.bancada.pedra));
    $$('[data-cenario]').forEach((b) => marcar(b, b.dataset.cenario === c.iluminacao.cenario));
    $$<HTMLButtonElement>('[data-luz]').forEach((b) => {
      const id = b.dataset.luz as keyof Config['iluminacao']['acesas'];
      marcar(b, c.iluminacao.acesas[id], 'aria-checked');
      // luz de algo que não está na composição fica indisponível (sem fingir que acende)
      b.disabled = (id === 'pendentes' && !c.composicao.ilha) || (id === 'nichos' && c.composicao.aereos === 'fechados');
    });
    $$('[data-temperatura]').forEach((b) => marcar(b, b.dataset.temperatura === c.iluminacao.temperatura));
    $<HTMLButtonElement>('[data-acao="desfazer"]')!.disabled = !loja.podeDesfazer();

    // ponto vermelho nas categorias que saíram do padrão
    const difere = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
    const lacasAlteradas = papeis.some((p) => c.acabamentos[p.id] !== PADRAO.acabamentos[p.id] && !!lerLaca(c.acabamentos[p.id]));
    const madeirasAlteradas = papeis.some((p) => c.acabamentos[p.id] !== PADRAO.acabamentos[p.id] && !lerLaca(c.acabamentos[p.id]));
    const marcas: Record<string, boolean> = {
      ambiente: difere(c.composicao, PADRAO.composicao),
      materiais: madeirasAlteradas,
      cores: lacasAlteradas,
      puxadores: difere(c.puxador, PADRAO.puxador),
      bancada: difere(c.bancada, PADRAO.bancada),
      luz: difere(c.iluminacao, PADRAO.iluminacao),
      portas: motor.articulacoes().some((a) => a.alvo === 1),
    };
    $$('[data-aba]').forEach((b) => b.classList.toggle('is-alterado', !!marcas[b.dataset.aba!]));
  }

  /* ---------- abas (setas do teclado, como manda o padrão de abas) ---------- */
  const abas = $$<HTMLButtonElement>('[data-aba]');
  const abrirAba = (aba: HTMLButtonElement, focar = false) => {
    abas.forEach((b) => {
      const ativa = b === aba;
      marcar(b, ativa, 'aria-selected');
      b.tabIndex = ativa ? 0 : -1;
      $(`#${b.getAttribute('aria-controls')}`)!.hidden = !ativa;
    });
    painel.classList.remove('is-recolhido');
    $('[data-sim-recolher]')!.setAttribute('aria-expanded', 'true');
    if (focar) aba.focus();
    aba.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  abas.forEach((aba, i) => {
    aba.addEventListener('click', () => abrirAba(aba));
    aba.addEventListener('keydown', (e) => {
      const passo = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (passo) {
        e.preventDefault();
        abrirAba(abas[(i + passo + abas.length) % abas.length], true);
      }
      if (e.key === 'Home') abrirAba(abas[0], true);
      if (e.key === 'End') abrirAba(abas[abas.length - 1], true);
    });
  });
  $('[data-sim-recolher]')!.addEventListener('click', (e) => {
    const recolhido = painel.classList.toggle('is-recolhido');
    (e.currentTarget as HTMLElement).setAttribute('aria-expanded', String(!recolhido));
    (e.currentTarget as HTMLElement).setAttribute('aria-label', recolhido ? 'Abrir o painel' : 'Recolher o painel');
  });

  /* ---------- opções ---------- */
  const ao = (seletor: string, f: (el: HTMLElement) => void) => $$(seletor).forEach((el) => el.addEventListener('click', () => f(el)));

  ao('[data-opcao]', (b) => {
    const v = b.dataset.valor!;
    loja.mudar((c) => {
      if (b.dataset.opcao === 'ilha') c.composicao.ilha = v === 'sim';
      if (b.dataset.opcao === 'aereos') c.composicao.aereos = v === 'fechados' ? 'fechados' : 'nicho';
      if (b.dataset.opcao === 'espessura') c.bancada.espessura = v === 'encorpada' ? 'encorpada' : 'fina';
    });
  });
  ao('[data-papel]', (b) => {
    papelAlvo = b.dataset.papel as Papel;
    sincronizar();
  });
  ao('[data-acabamento]:not([data-cor])', (b) => loja.mudar((c) => (c.acabamentos[papelAlvo] = b.dataset.acabamento!)));
  ao('[data-cor]', (b) => loja.mudar((c) => (c.acabamentos[papelAlvo] = idLaca(b.dataset.cor!, brilhoAtual()))));
  ao('[data-brilho]', (b) => {
    brilhoPreferido = b.dataset.brilho as Brilho;
    const laca = lerLaca(loja.get().acabamentos[papelAlvo]);
    if (laca) loja.mudar((c) => (c.acabamentos[papelAlvo] = idLaca(laca.cor, brilhoPreferido)));
    else sincronizar();
  });
  ao('[data-puxador]', (b) => loja.mudar((c) => (c.puxador.tipo = b.dataset.puxador as Config['puxador']['tipo'])));
  ao('[data-metal]', (b) => loja.mudar((c) => (c.puxador.metal = b.dataset.metal as Config['puxador']['metal'])));
  ao('[data-pedra]', (b) => loja.mudar((c) => (c.bancada.pedra = b.dataset.pedra!)));
  ao('[data-cenario]', (b) => loja.mudar((c) => (c.iluminacao.cenario = b.dataset.cenario as Config['iluminacao']['cenario'])));
  ao('[data-luz]', (b) => {
    const id = b.dataset.luz as keyof Config['iluminacao']['acesas'];
    loja.mudar((c) => (c.iluminacao.acesas[id] = !c.iluminacao.acesas[id]));
  });
  ao('[data-temperatura]', (b) => loja.mudar((c) => (c.iluminacao.temperatura = b.dataset.temperatura as Config['iluminacao']['temperatura'])));

  // Pré-visualização: passar o mouse numa amostra mostra o resultado sem gravar.
  const previa = (el: HTMLElement): Config | null => {
    const c = clonar(loja.get());
    if (el.dataset.cor) c.acabamentos[papelAlvo] = idLaca(el.dataset.cor, brilhoAtual());
    else if (el.dataset.acabamento) c.acabamentos[papelAlvo] = el.dataset.acabamento;
    else if (el.dataset.pedra) c.bancada.pedra = el.dataset.pedra;
    else if (el.dataset.metal) c.puxador.metal = el.dataset.metal as Config['puxador']['metal'];
    else return null;
    return c;
  };
  $$('[data-acabamento], [data-pedra], [data-metal]').forEach((el) => {
    el.addEventListener('pointerenter', (e) => {
      if ((e as PointerEvent).pointerType !== 'mouse') return;
      const c = previa(el);
      if (c) motor.previsualizar(c);
    });
    el.addEventListener('pointerleave', (e) => {
      if ((e as PointerEvent).pointerType === 'mouse') motor.previsualizar(null);
    });
  });

  /* ---------- câmera ---------- */
  const marcarVista = (id: string | null) => $$('.sim__vistas [data-vista]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.vista === id)));
  ao('[data-vista]', (b) => {
    motor.irPara(b.dataset.vista as Parameters<Motor['irPara']>[0]);
    marcarVista(b.dataset.vista!);
  });
  marcarVista('inicial');
  ao('[data-zoom]', (b) => motor.aproximar(Number(b.dataset.zoom)));
  const dica = $('[data-sim-dica]')!;
  palco.addEventListener('pointerdown', () => {
    marcarVista(null);
    window.setTimeout(() => dica.classList.add('is-oculta'), 2500);
  });

  /* ---------- portas e gavetas ---------- */
  function desenharArticulacoes() {
    if (!interfacePronta) return;
    const grupos = new Map<string, ReturnType<Motor['articulacoes']>>();
    motor?.articulacoes().forEach((a) => {
      if (!grupos.has(a.grupo)) grupos.set(a.grupo, []);
      grupos.get(a.grupo)!.push(a);
    });
    lista.replaceChildren();
    for (const [grupo, itens] of grupos) {
      const titulo = document.createElement('h4');
      titulo.textContent = grupo;
      lista.append(titulo);
      for (const a of itens) {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-pressed', String(a.alvo === 1));
        b.textContent = a.nome;
        const estado = document.createElement('span');
        estado.textContent = a.alvo === 1 ? 'Aberta' : 'Fechada';
        b.append(estado);
        b.addEventListener('click', () => motor.alternar(a.id));
        lista.append(b);
      }
    }
    if (motor) sincronizarMarcaPortas();
  }
  const sincronizarMarcaPortas = () =>
    $('[data-aba="portas"]')?.classList.toggle('is-alterado', motor.articulacoes().some((a) => a.alvo === 1));
  ao('[data-todas]', (b) => {
    const t = b.dataset.todas!;
    if (t === 'fechar') motor.todas(false);
    else motor.todas(true, t as 'porta' | 'gaveta');
  });

  /* ---------- barra de ações ---------- */
  const botaoComparar = $('[data-acao="comparar"]')!;
  const divisor = $('[data-sim-divisor]')!;
  function definirComparacao(a: Config | null) {
    comparando = !!a;
    motor.comparar(a);
    divisor.hidden = !a;
    marcar(botaoComparar, comparando);
    divisor.style.setProperty('--x', '50%');
    motor.divisor(0.5);
  }
  const alca = $('.sim__divisor-alca')!;
  alca.addEventListener('pointerdown', (e) => {
    alca.setPointerCapture(e.pointerId);
    const mover = (ev: PointerEvent) => {
      const r = palco.getBoundingClientRect();
      const x = Math.min(0.95, Math.max(0.05, (ev.clientX - r.left) / r.width));
      divisor.style.setProperty('--x', `${x * 100}%`);
      motor.divisor(x);
    };
    const soltar = () => {
      alca.removeEventListener('pointermove', mover);
      alca.removeEventListener('pointerup', soltar);
    };
    alca.addEventListener('pointermove', mover);
    alca.addEventListener('pointerup', soltar);
  });
  alca.addEventListener('keydown', (e) => {
    const passo = { ArrowLeft: -0.05, ArrowRight: 0.05 }[e.key];
    if (!passo) return;
    e.preventDefault();
    const atual = parseFloat(divisor.style.getPropertyValue('--x') || '50') / 100;
    const x = Math.min(0.95, Math.max(0.05, atual + passo));
    divisor.style.setProperty('--x', `${x * 100}%`);
    motor.divisor(x);
  });

  let ultimaImagem: string | null = null;
  async function capturar(baixar: boolean) {
    const blob = await motor.capturar();
    if (!blob) {
      avisar('Não foi possível gerar a imagem.');
      return null;
    }
    if (ultimaImagem) URL.revokeObjectURL(ultimaImagem);
    ultimaImagem = URL.createObjectURL(blob);
    if (baixar) {
      const a = document.createElement('a');
      a.href = ultimaImagem;
      a.download = 'simulacao-cozinha-nova-era.jpg';
      a.click();
      avisar('Imagem da cena gerada.');
    }
    return ultimaImagem;
  }

  const contagem = $('[data-sim-contagem]')!;
  const atualizarContagem = () => {
    const n = lerSalvas().length;
    contagem.hidden = n === 0;
    contagem.textContent = String(n);
  };
  atualizarContagem();

  async function copiar(texto: string, mensagem: string) {
    try {
      await navigator.clipboard.writeText(texto);
      avisar(mensagem);
    } catch {
      window.prompt('Copie o texto abaixo:', texto);
    }
  }

  const acoes: Record<string, () => void> = {
    desfazer: () => loja.desfazer(),
    restaurar: () => {
      loja.definir(PADRAO);
      motor.todas(false);
      motor.irPara('inicial');
      marcarVista('inicial');
      avisar('Configuração padrão restaurada. Use “Desfazer” para voltar.');
    },
    comparar: () => {
      if (comparando) definirComparacao(null);
      else {
        definirComparacao(clonar(loja.get()));
        avisar('Lado A guardado. Mude materiais e cores para ver o lado B.');
      }
    },
    capturar: () => void capturar(true),
    salvar: () => {
      const s = salvar(loja.get());
      atualizarContagem();
      avisar(s ? `${s.nome} salva nesta sessão.` : 'O navegador não permitiu salvar.');
    },
    salvas: () => abrirSalvas(),
    link: () => void copiar(linkDe(loja.get()), 'Link copiado: quem abrir verá esta mesma configuração.'),
    'tela-cheia': () => alternarTelaCheia(),
    fechar: () => fecharSobreposto(),
    orcamento: () => void abrirOrcamento(),
  };
  $$('[data-acao]', secao).forEach((b) => b.addEventListener('click', () => acoes[b.dataset.acao!]?.()));

  raiz.addEventListener('keydown', (e) => {
    const alvo = e.target as HTMLElement;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !alvo.closest('input, textarea')) {
      e.preventDefault();
      loja.desfazer();
    }
  });

  /* ---------- configurações salvas ---------- */
  const dialogoSalvas = $<HTMLDialogElement>('[data-sim-salvas]', secao)!;
  const listaSalvas = $('[data-sim-lista-salvas]', secao)!;
  function abrirSalvas() {
    const salvas = lerSalvas();
    listaSalvas.replaceChildren();
    if (!salvas.length) {
      const li = document.createElement('li');
      li.className = 'vazio';
      li.textContent = 'Nenhuma configuração salva ainda. Use o botão “Salvar” na barra do simulador.';
      listaSalvas.append(li);
    }
    for (const s of salvas) {
      const li = document.createElement('li');
      const nome = document.createElement('strong');
      nome.textContent = s.nome;
      const hora = document.createElement('small');
      hora.textContent = new Date(s.quando).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const botao = (rotulo: string, f: () => void) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = rotulo;
        b.addEventListener('click', f);
        return b;
      };
      li.append(
        nome,
        hora,
        botao('Carregar', () => {
          if (comparando) definirComparacao(null);
          loja.definir(s.config);
          dialogoSalvas.close();
          avisar(`${s.nome} carregada.`);
        }),
        botao('Comparar', () => {
          definirComparacao(s.config);
          dialogoSalvas.close();
          avisar(`Lado A: ${s.nome}. Lado B: configuração atual.`);
        }),
        botao('Excluir', () => {
          excluirSalva(s.id);
          atualizarContagem();
          abrirSalvas();
        }),
      );
      listaSalvas.append(li);
    }
    if (!dialogoSalvas.open) dialogoSalvas.showModal();
  }

  /* ---------- resumo e orçamento ---------- */
  const dialogoOrc = $<HTMLDialogElement>('[data-sim-orcamento]', secao)!;
  const formOrc = $<HTMLFormElement>('[data-sim-orc-form]', secao)!;
  const listaResumo = $('[data-sim-resumo]', secao)!;
  const figura = $('[data-sim-orc-figura]', secao)!;
  const imagemOrc = $<HTMLImageElement>('[data-sim-orc-img]', secao)!;

  async function abrirOrcamento() {
    listaResumo.replaceChildren();
    for (const l of resumo(loja.get())) {
      const linha = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = l.rotulo;
      const dd = document.createElement('dd');
      dd.textContent = l.valor;
      if (l.alterado) {
        const em = document.createElement('em');
        em.textContent = 'alterado';
        dd.append(em);
      }
      linha.append(dt, dd);
      listaResumo.append(linha);
    }
    // o espaço da imagem já fica reservado: a lista não pula quando a captura termina
    figura.hidden = false;
    imagemOrc.removeAttribute('src');
    dialogoOrc.showModal();
    o.lenis?.stop();
    const url = await capturar(false);
    if (url) imagemOrc.src = url;
    else figura.hidden = true;
  }
  // Enter num campo não fecha o diálogo (só o botão de fechar faz isso)
  formOrc.addEventListener('submit', (e) => {
    if ((e.submitter as HTMLButtonElement | null)?.value !== 'fechar') e.preventDefault();
  });
  dialogoOrc.addEventListener('close', () => {
    if (!raiz.classList.contains('is-sobreposto')) o.lenis?.start();
  });
  dialogoSalvas.addEventListener('close', () => {
    if (!raiz.classList.contains('is-sobreposto')) o.lenis?.start();
  });
  dialogoSalvas.addEventListener('toggle', () => dialogoSalvas.open && o.lenis?.stop());

  const textoResumo = () => {
    const nome = (formOrc.elements.namedItem('nome') as HTMLInputElement).value.trim();
    const obs = (formOrc.elements.namedItem('obs') as HTMLTextAreaElement).value.trim();
    return [
      'Olá! Fiz uma simulação no site da Nova Era Móveis Planejados e gostaria de solicitar um orçamento.',
      '',
      '*Simulação (ilustrativa)*',
      ...resumo(loja.get()).map((l) => `• ${l.rotulo}: ${l.valor}`),
      nome ? `\n*Nome:* ${nome}` : null,
      obs ? `*Observações:* ${obs}` : null,
      '',
      `Link da simulação: ${linkDe(loja.get())}`,
    ]
      .filter((l): l is string => l !== null)
      .join('\n');
  };
  $('[data-sim-enviar]', secao)!.addEventListener('click', () => {
    const link = `https://wa.me/${numero}?text=${encodeURIComponent(textoResumo())}`;
    const janela = window.open(link, '_blank', 'noopener');
    if (!janela) window.location.href = link;
  });
  $('[data-sim-copiar-resumo]', secao)!.addEventListener('click', () => void copiar(textoResumo(), 'Resumo copiado.'));

  /* ---------- tela cheia ---------- */
  function abrirSobreposto() {
    if (raiz.classList.contains('is-sobreposto')) return;
    raiz.classList.add('is-sobreposto');
    document.documentElement.classList.add('simulador-aberto');
    o.lenis?.stop();
    document.documentElement.style.overflow = 'hidden';
    motor.definirTelaCheia(true);
    marcar($('[data-acao="tela-cheia"]')!, true);
  }
  function fecharSobreposto() {
    if (!raiz.classList.contains('is-sobreposto')) return;
    raiz.classList.remove('is-sobreposto');
    document.documentElement.classList.remove('simulador-aberto');
    document.documentElement.style.overflow = '';
    o.lenis?.start();
    motor?.definirTelaCheia(false);
    marcar($('[data-acao="tela-cheia"]')!, false);
    raiz.dispatchEvent(new CustomEvent('simulador:fechado'));
  }
  function alternarTelaCheia() {
    if (document.fullscreenElement === raiz) return void document.exitFullscreen();
    if (raiz.classList.contains('is-sobreposto')) return fecharSobreposto();
    if (!raiz.requestFullscreen || !document.fullscreenEnabled) return abrirSobreposto();
    raiz.requestFullscreen().catch(() => abrirSobreposto());
    // Alguns navegadores embutidos em apps não entram em tela cheia nem acusam erro.
    window.setTimeout(() => {
      if (document.fullscreenElement !== raiz) abrirSobreposto();
    }, 500);
  }
  document.addEventListener('fullscreenchange', () => {
    const cheia = document.fullscreenElement === raiz;
    if (cheia) fecharSobreposto(); // a tela cheia nativa chegou depois do plano B
    motor.definirTelaCheia(cheia);
    marcar($('[data-acao="tela-cheia"]')!, cheia);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && raiz.classList.contains('is-sobreposto') && !dialogoOrc.open && !dialogoSalvas.open) fecharSobreposto();
  });

  interfacePronta = true;
  sincronizar();
  desenharArticulacoes();

  return {
    motor,
    loja,
    abrirSobreposto,
    fecharSobreposto,
  };
}

export type Configurador = NonNullable<Awaited<ReturnType<typeof iniciarConfigurador>>>;
