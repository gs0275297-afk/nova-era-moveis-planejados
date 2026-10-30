import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import gsap from 'gsap';

import { observar } from '../util';

import { luzes as listaLuzes, papeis, type Cenario, type IdAmbiente, type Vista } from './catalogo';
import type { Config } from './estado';
import { criarMateriais } from './materiais';
import type { Articulacao } from './moveis';
import type { AmbienteMontado, MontarAmbiente } from './ambientes/tipos';

/** Cada ambiente é carregado sob demanda: adicionar um novo = um módulo + uma linha aqui. */
const AMBIENTES: Record<IdAmbiente, () => Promise<MontarAmbiente>> = {
  cozinha: () => import('./ambientes/cozinha').then((m) => m.montarCozinha),
};

const CENARIOS: Record<Cenario, { sol: number; solCor: string; tarde: boolean; env: number; exposicao: number; janela: number; ceu: string; fundo: string }> = {
  dia: { sol: 3.4, solCor: '#fff2df', tarde: false, env: 0.5, exposicao: 1.0, janela: 5, ceu: '#e6eff6', fundo: '#e9e8e3' },
  tarde: { sol: 2.8, solCor: '#ffad66', tarde: true, env: 0.3, exposicao: 1.02, janela: 2.4, ceu: '#f3c494', fundo: '#e7ddd2' },
  neutra: { sol: 0, solCor: '#ffffff', tarde: false, env: 0.75, exposicao: 1.05, janela: 3.6, ceu: '#dde1e6', fundo: '#e4e5e6' },
  noite: { sol: 0, solCor: '#ffffff', tarde: false, env: 0.06, exposicao: 1.28, janela: 0, ceu: '#151c30', fundo: '#141a2b' },
};
const COR_LUZ = { quente: '#ffcf9f', neutra: '#fff1e3' };

export interface OpcoesMotor {
  leve: boolean;
  reduzido: boolean;
  toque: boolean;
}

export interface EventosMotor {
  carga?: (pendentes: number) => void;
  articulacoes?: () => void;
  apontar?: (rotulo: string | null) => void;
  perdeuContexto?: () => void;
}

export function criarMotor(alvo: HTMLElement, opcoes: OpcoesMotor, eventos: EventosMotor = {}) {
  /* ---------- renderizador ---------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  if (!renderer.capabilities.isWebGL2) {
    renderer.dispose();
    throw new Error('WebGL 2 indisponível');
  }
  let leve = opcoes.leve;
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, leve ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // suave pelo shadow.radius de cada luz
  renderer.shadowMap.autoUpdate = false; // a sombra só é recalculada quando algo muda
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  // No toque, fora da tela cheia, o gesto vertical continua rolando a página (girar fica na horizontal).
  canvas.style.touchAction = opcoes.toque ? 'pan-y' : 'none';
  alvo.prepend(canvas);

  const cena = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const sala = new RoomEnvironment();
  const ambienteLuz = pmrem.fromScene(sala, 0.04).texture;
  cena.environment = ambienteLuz;
  sala.dispose();
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 80);
  const controles = new OrbitControls(camera, canvas);
  controles.enableDamping = true;
  controles.dampingFactor = 0.085;
  controles.rotateSpeed = 0.6;
  controles.panSpeed = 0.8;
  controles.screenSpacePanning = true;
  controles.enableZoom = opcoes.toque; // pinça no toque; no mouse, a roda é tratada abaixo
  controles.minPolarAngle = 0;
  controles.maxPolarAngle = 1.5;

  let precisa = true;
  const pedir = () => (precisa = true);
  controles.addEventListener('change', pedir);

  const materiais = criarMateriais({
    leve,
    anisotropia: Math.min(leve ? 4 : 8, renderer.capabilities.getMaxAnisotropy()),
    aoMudar: pedir,
  });
  materiais.aoCarregar((n) => eventos.carga?.(n));

  let config: Config | null = null;
  let ambiente: AmbienteMontado | null = null;
  let idAmbiente: IdAmbiente | null = null;
  const alvoMin = new THREE.Vector3();
  const alvoMax = new THREE.Vector3();

  const materialDe = (papel: string, c: Config | null = config): THREE.Material => {
    if (c) {
      if (papel in c.acabamentos) return materiais.acabamento(c.acabamentos[papel as keyof Config['acabamentos']]);
      if (papel === 'bancada') return materiais.acabamento(c.bancada.pedra);
      if (papel === 'metal') return materiais.metal(c.puxador.metal);
    }
    if (papel === 'decoMadeira') return materiais.acabamento('carvalho');
    return (materiais.fixos as Record<string, THREE.Material>)[papel] ?? materiais.fixos.interior;
  };

  /* ---------- oclusão de ambiente (quadro "completo", só com a câmera parada) ---------- */
  let composicao: EffectComposer | null = null;
  const montarComposicao = () => {
    if (leve || composicao) return;
    const destino = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
    composicao = new EffectComposer(renderer, destino);
    composicao.addPass(new RenderPass(cena, camera));
    const ao = new GTAOPass(cena, camera, 1, 1);
    ao.updateGtaoMaterial({ radius: 0.28, distanceExponent: 1.4, thickness: 1, scale: 1.1, samples: 16 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    ao.blendIntensity = 0.8;
    composicao.addPass(ao);
    composicao.addPass(new OutputPass());
    composicao.setPixelRatio(renderer.getPixelRatio());
    if (largura) composicao.setSize(largura, altura);
  };

  /* ---------- tamanho ---------- */
  let largura = 0;
  let altura = 0;
  let fatorDistancia = 1;
  const ajustarTamanho = () => {
    const r = alvo.getBoundingClientRect();
    if (!r.width || !r.height || (r.width === largura && r.height === altura)) return;
    largura = r.width;
    altura = r.height;
    renderer.setSize(largura, altura, false);
    composicao?.setSize(largura, altura);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    const aspecto = largura / altura;
    camera.aspect = aspecto;
    // telas em pé: abre a lente e afasta um pouco, para o ambiente caber
    camera.fov = THREE.MathUtils.clamp(38 * Math.sqrt(1.45 / aspecto), 38, 58);
    fatorDistancia = THREE.MathUtils.clamp(Math.pow(1.45 / aspecto, 0.35), 1, 1.4);
    camera.updateProjectionMatrix();
    pedir();
  };
  const observadorTamanho = new ResizeObserver(ajustarTamanho);
  observadorTamanho.observe(alvo);
  ajustarTamanho(); // já mede agora: o primeiro aviso do ResizeObserver só vem no próximo quadro

  /* ---------- aplicar configuração ---------- */
  const aplicarAcabamentos = (c: Config) => {
    if (!ambiente) return;
    const m = ambiente.montagem;
    for (const p of papeis) m.aplicar(p.id, materialDe(p.id, c));
    m.aplicar('bancada', materialDe('bancada', c));
    m.aplicar('metal', materialDe('metal', c));
  };

  const aplicarLuz = (c: Config) => {
    if (!ambiente) return;
    const k = CENARIOS[c.iluminacao.cenario];
    const s = ambiente.sol;
    s.luz.visible = k.sol > 0;
    s.luz.intensity = k.sol;
    s.luz.color.set(k.solCor);
    s.luz.position.set(...(k.tarde ? s.tarde : s.dia));
    if (ambiente.janela) {
      ambiente.janela.visible = k.janela > 0;
      ambiente.janela.intensity = k.janela;
      ambiente.janela.color.set(k.tarde ? '#ffd9b5' : '#eef4ff');
    }
    ambiente.exterior.color.set(k.ceu);
    cena.environmentIntensity = k.env;
    renderer.toneMappingExposure = k.exposicao;
    alvo.style.setProperty('--fundo-cena', k.fundo);
    alvo.dataset.cenario = c.iluminacao.cenario;
    const cor = new THREE.Color(COR_LUZ[c.iluminacao.temperatura]);
    for (const l of listaLuzes) {
      const grupo = ambiente.luzes[l.id];
      const acesa = c.iluminacao.acesas[l.id];
      grupo.luzes.forEach((luz) => {
        luz.visible = acesa && (l.id !== 'pendentes' || c.composicao.ilha);
        luz.color.copy(cor);
      });
      grupo.visuais.forEach((v) => (v.visible = acesa));
    }
    ambiente.emissivos.forEach((mat) => mat.color.copy(cor).lerp(new THREE.Color('#ffffff'), mat.blending === THREE.AdditiveBlending ? 0 : 0.25));
    renderer.shadowMap.needsUpdate = true;
  };

  function aplicar(c: Config, anterior?: Config | null) {
    config = c;
    if (!ambiente) return;
    aplicarAcabamentos(c);
    if (!anterior || anterior.puxador.tipo !== c.puxador.tipo) {
      ambiente.montagem.montarPuxadores(c.puxador.tipo);
      ambiente.montagem.aplicar('metal', materialDe('metal', c));
    }
    ambiente.aplicarComposicao(c);
    aplicarLuz(c);
    if (!anterior || anterior.composicao.ilha !== c.composicao.ilha || anterior.composicao.aereos !== c.composicao.aereos) {
      // portas que sumiram com a composição voltam fechadas
      ambiente.montagem.articulacoes.forEach((a) => {
        if (!ambiente!.articulacoesVisiveis().includes(a)) fecharJa(a);
      });
      eventos.articulacoes?.();
    }
    renderer.shadowMap.needsUpdate = true;
    pedir();
  }

  /** Mostra outro acabamento sem gravar (pré-visualização ao passar o mouse na amostra). */
  function previsualizar(c: Config | null) {
    aplicarAcabamentos(c ?? config!);
    pedir();
  }

  /* ---------- ambiente ---------- */
  async function carregarAmbiente(id: IdAmbiente, c: Config) {
    const montar = await AMBIENTES[id]();
    if (ambiente) {
      cena.remove(ambiente.montagem.raiz);
      ambiente.dispose();
    }
    config = c;
    ambiente = montar({ materiais, leve, materialDe: (p) => materialDe(p) });
    idAmbiente = id;
    cena.add(ambiente.montagem.raiz);
    alvoMin.set(...ambiente.limitesAlvo.min);
    alvoMax.set(...ambiente.limitesAlvo.max);
    controles.minDistance = ambiente.distancia[0];
    controles.maxDistance = ambiente.distancia[1];
    aplicar(c, null);
    irPara('inicial', true);
    montarComposicao();
    // as outras madeiras e pedras vêm em segundo plano: a troca fica instantânea
    const ocioso = (window as Window & { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1200));
    ocioso(() => materiais.precarregar(['carvalho', 'freijo', 'nogueira', 'nogueira-escura', 'marmore', 'quartzo', 'granito', 'pedra-escura']));
    eventos.articulacoes?.();
  }

  /* ---------- câmera ---------- */
  let animacaoCamera: gsap.core.Tween | null = null;
  function irPara(vista: Vista, instantaneo = false) {
    if (!ambiente) return;
    const v = ambiente.vistas[vista];
    const alvoV = new THREE.Vector3(...v.alvo);
    const posV = new THREE.Vector3(...v.pos).sub(alvoV).multiplyScalar(fatorDistancia).add(alvoV);
    animacaoCamera?.kill();
    if (instantaneo || opcoes.reduzido) {
      camera.position.copy(posV);
      controles.target.copy(alvoV);
      controles.update();
      pedir();
      return;
    }
    const e = { px: camera.position.x, py: camera.position.y, pz: camera.position.z, tx: controles.target.x, ty: controles.target.y, tz: controles.target.z };
    animacaoCamera = gsap.to(e, {
      px: posV.x, py: posV.y, pz: posV.z, tx: alvoV.x, ty: alvoV.y, tz: alvoV.z,
      duration: 1.3,
      ease: 'power3.inOut',
      onUpdate: () => {
        camera.position.set(e.px, e.py, e.pz);
        controles.target.set(e.tx, e.ty, e.tz);
        pedir();
      },
    });
  }

  function aproximar(fator: number) {
    animacaoCamera?.kill();
    const deslocamento = camera.position.clone().sub(controles.target);
    const d = THREE.MathUtils.clamp(deslocamento.length() * fator, controles.minDistance, controles.maxDistance);
    const destino = controles.target.clone().add(deslocamento.setLength(d));
    if (opcoes.reduzido) {
      camera.position.copy(destino);
      pedir();
      return;
    }
    animacaoCamera = gsap.to(camera.position, { x: destino.x, y: destino.y, z: destino.z, duration: 0.45, ease: 'power2.out', onUpdate: pedir });
  }

  // O ponto de mira não sai do ambiente (deslocar a câmera não leva para "o nada").
  controles.addEventListener('change', () => {
    const t = controles.target;
    const preso = t.clone().clamp(alvoMin, alvoMax);
    if (!preso.equals(t)) {
      camera.position.add(preso.clone().sub(t));
      t.copy(preso);
    }
  });

  // Rolagem: aproxima só com Ctrl/Cmd ou depois de clicar na cena (a rolagem comum continua
  // rolando a página). Em tela cheia, a rolagem sempre aproxima.
  let rodaLivre = false;
  let telaCheia = false;
  const aoRolar = (e: WheelEvent) => {
    if (!(telaCheia || rodaLivre || e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    aproximar(e.deltaY > 0 ? 1.1 : 0.9);
  };
  canvas.addEventListener('wheel', aoRolar, { passive: false });
  const sairDaCena = () => {
    rodaLivre = false;
    alvo.removeAttribute('data-lenis-prevent');
    eventos.apontar?.(null);
  };
  canvas.addEventListener('pointerleave', sairDaCena);

  /* ---------- portas e gavetas: clique na cena ---------- */
  const raio = new THREE.Raycaster();
  const ponteiro = new THREE.Vector2();
  let inicioToque: { x: number; y: number; t: number } | null = null;
  const pecasClicaveis = () => (ambiente ? ambiente.articulacoesVisiveis().flatMap((a) => a.pecas) : []);
  const tocar = (x: number, y: number): Articulacao | null => {
    const r = canvas.getBoundingClientRect();
    ponteiro.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    raio.setFromCamera(ponteiro, camera);
    const acerto = raio.intersectObjects(pecasClicaveis(), false)[0];
    return (acerto?.object.userData.articulacao as Articulacao | undefined) ?? null;
  };
  canvas.addEventListener('pointerdown', (e) => {
    inicioToque = { x: e.clientX, y: e.clientY, t: performance.now() };
    rodaLivre = true;
    alvo.setAttribute('data-lenis-prevent', '');
    animacaoCamera?.kill();
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!inicioToque) return;
    const parado = Math.hypot(e.clientX - inicioToque.x, e.clientY - inicioToque.y) < 6 && performance.now() - inicioToque.t < 500;
    inicioToque = null;
    if (!parado) return;
    const a = tocar(e.clientX, e.clientY);
    if (a) alternar(a.id);
  });
  let quadroApontar = 0;
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    cancelAnimationFrame(quadroApontar);
    quadroApontar = requestAnimationFrame(() => {
      const a = tocar(e.clientX, e.clientY);
      canvas.style.cursor = a ? 'pointer' : 'grab';
      eventos.apontar?.(a ? `${a.t > 0.5 ? 'Fechar' : 'Abrir'}: ${a.nome.toLowerCase()}` : null);
    });
  });

  function fecharJa(a: Articulacao) {
    a.alvo = 0;
    a.t = 0;
    if (a.eixo === 'z') a.no.position.z = a.base;
    else a.no.rotation[a.eixo] = a.base;
  }

  function alternar(id: string, abrir?: boolean) {
    const a = ambiente?.montagem.articulacoes.find((x) => x.id === id);
    if (!a) return;
    a.alvo = (abrir ?? a.alvo === 0) ? 1 : 0;
    if (opcoes.reduzido) {
      a.t = a.alvo === 1 ? 0.999 : 0.001; // o próximo quadro conclui sem animação perceptível
    }
    eventos.articulacoes?.();
    pedir();
  }

  function todas(abrir: boolean, tipo?: Articulacao['tipo']) {
    ambiente?.articulacoesVisiveis().forEach((a) => {
      if (!tipo || a.tipo === tipo || (tipo === 'porta' && a.tipo === 'basculante')) alternar(a.id, abrir);
    });
  }

  /* ---------- comparação A | B ---------- */
  let comparacao: { a: Config; divisor: number } | null = null;
  const tamanho = new THREE.Vector2();
  const desenharDividido = () => {
    if (!comparacao || !config) return;
    renderer.getSize(tamanho);
    const x = Math.round(tamanho.x * comparacao.divisor);
    renderer.setScissorTest(true);
    aplicarAcabamentos(comparacao.a);
    renderer.setScissor(0, 0, x, tamanho.y);
    renderer.render(cena, camera);
    aplicarAcabamentos(config);
    renderer.setScissor(x, 0, tamanho.x - x, tamanho.y);
    renderer.render(cena, camera);
    renderer.setScissorTest(false);
  };

  /* ---------- ciclo de desenho sob demanda ---------- */
  /** A sombra é recalculada dentro do render; só nesse quadro as paredes-sombra ficam ativas. */
  const comSombraAtualizada = (desenhar: () => void) => {
    const recalcular = renderer.shadowMap.needsUpdate && !!ambiente;
    if (recalcular) ambiente!.sombras.visible = true;
    desenhar();
    if (recalcular) ambiente!.sombras.visible = false;
  };
  const desenharRapido = () => comSombraAtualizada(() => (comparacao ? desenharDividido() : renderer.render(cena, camera)));
  const desenharCompleto = () => {
    if (!composicao || comparacao) return desenharRapido();
    // a composição tem passes que não devem enxergar as paredes-sombra: a sombra vem antes dela
    if (renderer.shadowMap.needsUpdate) desenharRapido();
    composicao.render();
  };

  let quadro = 0;
  let ativo = false;
  let ultimo = 0;
  let ultimaMudanca = 0;
  let faltaCompleto = false;
  let ultimoRapido = 0;
  const intervalos: number[] = [];

  const degradar = () => {
    if (!leve) {
      leve = true;
      composicao?.dispose();
      composicao = null;
    } else if (renderer.getPixelRatio() > 1) {
      renderer.setPixelRatio(1);
      largura = 0;
      ajustarTamanho();
    }
    pedir();
  };

  const desenhar = (agora: number) => {
    if (!ativo) return;
    quadro = requestAnimationFrame(desenhar);
    const dt = Math.min(0.05, (agora - (ultimo || agora)) / 1000);
    ultimo = agora;
    if (!ambiente) return;
    const mexeu = controles.update();
    const animando = ambiente.montagem.animar(dt);
    if (animando) renderer.shadowMap.needsUpdate = true;
    if (mexeu || animando || precisa) {
      precisa = false;
      ambiente.atualizarCortes(camera.position);
      desenharRapido();
      faltaCompleto = !!composicao;
      const intervalo = agora - ultimoRapido;
      if (intervalo < 120 && agora - ultimaMudanca < 120 && mexeu) {
        intervalos.push(intervalo);
        if (intervalos.length >= 40) {
          const mediana = [...intervalos].sort((a, b) => a - b)[20];
          intervalos.length = 0;
          if (mediana > 38) degradar();
        }
      }
      ultimoRapido = agora;
      ultimaMudanca = agora;
    } else if (faltaCompleto && agora - ultimaMudanca > 220) {
      faltaCompleto = false;
      desenharCompleto();
    }
  };

  let suspenso = false;
  function retomar() {
    if (ativo || suspenso) return;
    ativo = true;
    ultimo = 0;
    pedir();
    quadro = requestAnimationFrame(desenhar);
  }
  function pausar() {
    ativo = false;
    cancelAnimationFrame(quadro);
  }

  // Fora da tela ou com a aba escondida, nada é desenhado.
  let naTela = true;
  const observadorVisivel = observar(([e]) => {
    naTela = e.isIntersecting;
    if (naTela && !document.hidden) retomar();
    else pausar();
  });
  observadorVisivel.observe(alvo);
  const aoMudarAba = () => (document.hidden ? pausar() : naTela && retomar());
  document.addEventListener('visibilitychange', aoMudarAba);

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    pausar();
    eventos.perdeuContexto?.();
  });

  /* ---------- captura da cena (sem a interface) ---------- */
  async function capturar(larguraAlvo = 2000): Promise<Blob | null> {
    if (!config) return null;
    const pr = renderer.getPixelRatio();
    const escala = THREE.MathUtils.clamp(larguraAlvo / Math.max(1, largura), 1, 3);
    const fundoAntes = cena.background;
    cena.background = new THREE.Color(CENARIOS[config.iluminacao.cenario].fundo);
    renderer.setPixelRatio(escala);
    renderer.setSize(largura, altura, false);
    composicao?.setPixelRatio(escala);
    composicao?.setSize(largura, altura);
    const antes = comparacao;
    comparacao = null;
    ambiente?.atualizarCortes(camera.position);
    desenharCompleto();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
    comparacao = antes;
    cena.background = fundoAntes;
    renderer.setPixelRatio(pr);
    renderer.setSize(largura, altura, false);
    composicao?.setPixelRatio(pr);
    composicao?.setSize(largura, altura);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    pedir();
    return blob;
  }

  return {
    carregarAmbiente,
    aplicar,
    previsualizar,
    irPara,
    aproximar,
    alternar,
    todas,
    articulacoes: () => ambiente?.articulacoesVisiveis() ?? [],
    comparar(a: Config | null) {
      comparacao = a ? { a, divisor: comparacao?.divisor ?? 0.5 } : null;
      if (!a && config) aplicarAcabamentos(config);
      pedir();
    },
    divisor(v: number) {
      if (comparacao) comparacao.divisor = THREE.MathUtils.clamp(v, 0.05, 0.95);
      pedir();
    },
    definirTelaCheia(v: boolean) {
      telaCheia = v;
      if (opcoes.toque) canvas.style.touchAction = v ? 'none' : 'pan-y';
      largura = 0;
      ajustarTamanho();
    },
    capturar,
    pendentes: () => materiais.pendentes(),
    ambienteAtual: () => idAmbiente,
    retomar,
    pausar,
    /** suspende o desenho mesmo com a seção visível (ex.: capa cobrindo a cena no celular) */
    suspender(v: boolean) {
      suspenso = v;
      if (v) pausar();
      else if (naTela && !document.hidden) retomar();
    },
    /** só para conferência em desenvolvimento: avança a cena sem depender do requestAnimationFrame */
    avancarQuadros(n = 1, dt = 1 / 30) {
      if (!import.meta.env.DEV || !ambiente) return;
      ajustarTamanho();
      for (let i = 0; i < n; i++) {
        controles.update();
        if (ambiente.montagem.animar(dt)) renderer.shadowMap.needsUpdate = true;
        if (animacaoCamera) animacaoCamera.progress(Math.min(1, animacaoCamera.progress() + dt / 1.3));
      }
      ambiente.atualizarCortes(camera.position);
      desenharCompleto();
    },
    /** só em desenvolvimento: posição na tela (px da janela) do centro da frente de uma articulação */
    telaDe(id: string) {
      if (!import.meta.env.DEV) return null;
      const a = ambiente?.montagem.articulacoes.find((x) => x.id === id);
      if (!a) return null;
      const p = new THREE.Box3().setFromObject(a.pecas[0]).getCenter(new THREE.Vector3()).project(camera);
      const r = canvas.getBoundingClientRect();
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
    },
    /** quantos quadros já foram desenhados (para conferir que nada é desenhado à toa) */
    quadrosDesenhados: () => renderer.info.render.frame,
    /** números de desempenho, medidos num quadro direto (sem a oclusão), para conferência */
    estatisticas() {
      renderer.render(cena, camera);
      pedir();
      const info = renderer.info;
      return {
        chamadas: info.render.calls,
        triangulos: info.render.triangles,
        geometrias: info.memory.geometries,
        texturas: info.memory.textures,
        programas: info.programs?.length ?? 0,
        leve,
        pixelRatio: renderer.getPixelRatio(),
      };
    },
    destruir() {
      pausar();
      animacaoCamera?.kill();
      observadorTamanho.disconnect();
      observadorVisivel.disconnect();
      document.removeEventListener('visibilitychange', aoMudarAba);
      controles.dispose();
      composicao?.dispose();
      if (ambiente) {
        cena.remove(ambiente.montagem.raiz);
        ambiente.dispose();
      }
      ambiente = null;
      materiais.dispose();
      ambienteLuz.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

export type Motor = ReturnType<typeof criarMotor>;
