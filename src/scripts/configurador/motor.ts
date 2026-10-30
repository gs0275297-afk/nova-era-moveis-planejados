import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

import { observar } from '../util';

import { idLaca, luzes as listaLuzes, papeis, type Cenario, type IdAmbiente, type Vista } from './catalogo';
import type { Config } from './estado';
import { criarMateriais, MAX_LINHAS, MAX_PONTOS } from './materiais';
import type { Articulacao } from './moveis';
import type { AmbienteMontado, GrupoLuzLeve, MontarAmbiente } from './ambientes/tipos';

/*
 * Pipeline do simulador (decisões vindas de medição, ver README):
 * - toda a cena é desenhada em HDR num alvo com MSAA; a saída faz o mapeamento de tons e a cor final;
 * - em movimento: um quadro por vez, com resolução dinâmica se a GPU não acompanhar;
 * - parado: refinamento progressivo, quadro a quadro, sem travar a interação (antisserrilhado por
 *   deslocamento de câmera, penumbra por deslocamento do sol, oclusão de ambiente uma única vez);
 * - sem nada mudando, nada é desenhado.
 */

/** Cada ambiente é carregado sob demanda: adicionar um novo = um módulo + uma linha aqui. */
const AMBIENTES: Record<IdAmbiente, () => Promise<MontarAmbiente>> = {
  cozinha: () => import('./ambientes/cozinha').then((m) => m.montarCozinha),
};

interface Luminosidade {
  sol: number;
  solCor: string;
  tarde: boolean;
  /** força do reflexo da própria sala (luz rebatida) */
  env: number;
  /** preenchimento mínimo, para nenhuma superfície ficar preta */
  base: number;
  exposicao: number;
  janela: number;
  janelaCor: string;
  rebote: number;
  /** céu visto pela janela: cor e brilho (acima de 1: estoura como numa foto real) */
  ceu: string;
  ceuForca: number;
  fundo: string;
}

const CENARIOS: Record<Cenario, Luminosidade> = {
  dia: { sol: 4.4, solCor: '#fff5e8', tarde: false, env: 0.9, base: 0.1, exposicao: 0.8, janela: 10, janelaCor: '#dfe9ff', rebote: 1.6, ceu: '#ffffff', ceuForca: 3.4, fundo: '#e9e8e3' },
  tarde: { sol: 4.2, solCor: '#ffbe85', tarde: true, env: 1, base: 0.12, exposicao: 0.98, janela: 8, janelaCor: '#ffe2c8', rebote: 1.8, ceu: '#ffd9b4', ceuForca: 2.6, fundo: '#e7ddd2' },
  neutra: { sol: 0, solCor: '#ffffff', tarde: false, env: 1, base: 0.16, exposicao: 0.92, janela: 11, janelaCor: '#f4f6fa', rebote: 0, ceu: '#f2f4f7', ceuForca: 2.6, fundo: '#e4e5e6' },
  noite: { sol: 0, solCor: '#ffffff', tarde: false, env: 1, base: 0.02, exposicao: 0.95, janela: 0, janelaCor: '#ffffff', rebote: 0, ceu: '#1a2238', ceuForca: 0.25, fundo: '#141a2b' },
};
const COR_LUZ = { quente: '#ffe3c8', neutra: '#fff6ee' };
const BRANCO = new THREE.Color('#ffffff');

/** Sem tranco no início nem no fim (aceleração zero nos dois extremos). */
const suave = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const halton = (i: number, base: number) => {
  let f = 1;
  let r = 0;
  for (let n = i; n > 0; n = Math.floor(n / base)) {
    f /= base;
    r += f * (n % base);
  }
  return r;
};

const VERTICE_QUAD = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`;

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
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!renderer.capabilities.isWebGL2) {
    renderer.dispose();
    throw new Error('WebGL 2 indisponível');
  }
  const leve = opcoes.leve;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; // preserva a cor do acabamento e só comprime os brilhos
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // suave pelo shadow.radius e pela penumbra acumulada
  renderer.shadowMap.autoUpdate = false; // a sombra só é recalculada quando algo muda
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  // No toque, fora da tela cheia, o gesto vertical continua rolando a página (girar fica na horizontal).
  canvas.style.touchAction = opcoes.toque ? 'pan-y' : 'none';
  alvo.prepend(canvas);

  const cena = new THREE.Scene();
  const fundoCena = new THREE.Color('#e9e8e3');
  cena.background = fundoCena;
  const luzBase = new THREE.AmbientLight('#ffffff', 0);
  cena.add(luzBase);

  /* ---------- sonda de reflexo: tamanho constante, para os shaders nunca mudarem de variante ---------- */
  const TAM_SONDA = leve ? 128 : 256;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const cenaVazia = new THREE.Scene();
  let sonda = pmrem.fromScene(cenaVazia, 0, 0.1, 1, { size: TAM_SONDA });
  cena.environment = sonda.texture;

  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 80);
  const controles = new OrbitControls(camera, canvas);
  controles.enableDamping = true;
  controles.rotateSpeed = 0.55;
  controles.panSpeed = 0.8;
  controles.screenSpacePanning = true;
  controles.enableZoom = opcoes.toque; // pinça no toque; no mouse, a roda é tratada abaixo
  controles.minPolarAngle = 0;
  controles.maxPolarAngle = 1.52;
  // a câmera não dá a volta por trás dos armários
  controles.minAzimuthAngle = -2.1;
  controles.maxAzimuthAngle = 2.1;

  let precisa = true;
  const pedir = () => (precisa = true);
  controles.addEventListener('change', pedir);

  let sondaEm = 0;
  const agendarSonda = (ms: number) => (sondaEm = performance.now() + ms);

  // Textura nova vai para a GPU em ocioso, uma por quadro: a primeira troca de acabamento não trava.
  const filaTexturas: THREE.Texture[] = [];
  const materiais = criarMateriais({
    leve,
    anisotropia: Math.min(leve ? 4 : 8, renderer.capabilities.getMaxAnisotropy()),
    aoMudar: () => {
      pedir();
      agendarSonda(500);
    },
    aoChegarTextura: (t) => filaTexturas.push(t),
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

  /* ---------- alvos de desenho e passes de tela cheia ---------- */
  const temHDR = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const tipoHDR = temHDR ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const alvoCena = new THREE.WebGLRenderTarget(1, 1, { type: tipoHDR, samples: 4 });
  alvoCena.resolveDepthBuffer = false; // ninguém lê essa profundidade: resolver o MSAA dela é custo à toa
  const alvoAcum = new THREE.WebGLRenderTarget(1, 1, { type: tipoHDR, depthBuffer: false });
  const AMOSTRAS = leve ? 8 : 24;
  const FORCA_AO = 0.85;

  const mistura = new THREE.ShaderMaterial({
    uniforms: { tCor: { value: null as THREE.Texture | null }, uPeso: { value: 1 } },
    vertexShader: VERTICE_QUAD,
    fragmentShader: /* glsl */ `
      uniform sampler2D tCor;
      uniform float uPeso;
      varying vec2 vUv;
      void main() { gl_FragColor = vec4( texture2D( tCor, vUv ).rgb, uPeso ); }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const quadMistura = new FullScreenQuad(mistura);

  const saida = new THREE.ShaderMaterial({
    uniforms: {
      tCor: { value: null as THREE.Texture | null },
      tEsquerda: { value: null as THREE.Texture | null },
      tAO: { value: null as THREE.Texture | null },
      uAO: { value: 0 },
      uDivisor: { value: 0 },
      uFusao: { value: 0 },
      uEscala: { value: new THREE.Vector2(1, 1) },
      uDesloc: { value: new THREE.Vector2(0, 0) },
    },
    vertexShader: VERTICE_QUAD,
    fragmentShader: /* glsl */ `
      uniform sampler2D tCor;
      uniform sampler2D tEsquerda;
      uniform sampler2D tAO;
      uniform float uAO;
      uniform float uDivisor;
      uniform float uFusao;
      uniform vec2 uEscala;
      uniform vec2 uDesloc;
      varying vec2 vUv;
      float ruido( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
      void main() {
        vec3 c = vUv.x < uDivisor ? texture2D( tEsquerda, vUv ).rgb : texture2D( tCor, vUv * uEscala + uDesloc ).rgb;
        if ( uFusao > 0.0 ) c = mix( c, texture2D( tEsquerda, vUv ).rgb, uFusao );
        if ( uAO > 0.0 ) c *= mix( 1.0, texture2D( tAO, vUv ).r, uAO );
        vec2 d = vUv - 0.5;
        c *= 1.0 - dot( d, d ) * 0.22;
        c = pow( max( c, vec3( 0.0 ) ) / 0.3, vec3( 1.1 ) ) * 0.3; // um pouco de contraste, como numa foto
        gl_FragColor = vec4( c, 1.0 );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb += ( ruido( gl_FragCoord.xy ) - 0.5 ) / 255.0;
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const quadSaida = new FullScreenQuad(saida);

  const ao = leve ? null : new GTAOPass(cena, camera, 1, 1);
  if (ao) {
    ao.output = GTAOPass.OUTPUT.Off;
    ao.updateGtaoMaterial({ radius: 0.3, distanceExponent: 1.5, thickness: 1, scale: 1.15, samples: 16 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    saida.uniforms.tAO.value = ao.pdRenderTarget.texture;
  }

  /* ---------- tamanho ---------- */
  let largura = 0;
  let altura = 0;
  let fatorDistancia = 1;
  let escala = 1; // resolução dinâmica: só vale com a câmera em movimento
  const dimensionarAlvos = (w: number, h: number) => {
    alvoCena.setSize(w, h);
    alvoAcum.setSize(w, h);
    ao?.setSize(Math.max(1, Math.round(w * 0.75)), Math.max(1, Math.round(h * 0.75)));
  };
  /** Limita o total de pixels: telas muito grandes não precisam de densidade máxima para ficar nítidas. */
  const razaoDePixels = () => {
    const limite = leve ? 1.8e6 : 3.6e6;
    const r = Math.min(window.devicePixelRatio, leve ? 1.5 : 2);
    return Math.min(r, Math.sqrt(limite / Math.max(1, largura * altura)));
  };
  const ajustarTamanho = () => {
    const r = alvo.getBoundingClientRect();
    if (!r.width || !r.height || (r.width === largura && r.height === altura)) return;
    largura = r.width;
    altura = r.height;
    const pr = razaoDePixels();
    renderer.setPixelRatio(pr);
    renderer.setSize(largura, altura, false);
    dimensionarAlvos(Math.round(largura * pr), Math.round(altura * pr));
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    const aspecto = largura / altura;
    camera.aspect = aspecto;
    // telas em pé: abre a lente e afasta um pouco, para o ambiente caber
    camera.fov = THREE.MathUtils.clamp(45 * Math.sqrt(1.45 / aspecto), 45, 64);
    fatorDistancia = THREE.MathUtils.clamp(Math.pow(1.45 / aspecto, 0.3), 1, 1.3);
    camera.updateProjectionMatrix();
    pedir();
    // o canvas foi limpo ao mudar de tamanho: redesenha já, para não piscar até o próximo quadro
    if (ambiente && ativo && !capturando) desenharEmMovimento();
  };
  const observadorTamanho = new ResizeObserver(ajustarTamanho);

  /* ---------- aplicar configuração ---------- */
  const aplicarAcabamentos = (c: Config) => {
    if (!ambiente) return;
    const m = ambiente.montagem;
    for (const p of papeis) m.aplicar(p.id, materialDe(p.id, c));
    m.aplicar('bancada', materialDe('bancada', c));
    m.aplicar('metal', materialDe('metal', c));
  };

  let solLigado = false;
  const solBase = new THREE.Vector3();
  const corUm = new THREE.Color();

  const aplicarLuz = (c: Config) => {
    if (!ambiente) return;
    const k = CENARIOS[c.iluminacao.cenario];
    const s = ambiente.sol;
    solLigado = k.sol > 0;
    s.luz.intensity = k.sol;
    s.luz.color.set(k.solCor);
    solBase.set(...(k.tarde ? s.tarde : s.dia));
    s.luz.position.copy(solBase);
    luzBase.intensity = k.base;
    ambiente.exterior.color.set(k.ceu).multiplyScalar(k.ceuForca);
    cena.environmentIntensity = k.env;
    renderer.toneMappingExposure = k.exposicao;
    fundoCena.set(k.fundo);
    alvo.style.setProperty('--fundo-cena', k.fundo);
    alvo.dataset.cenario = c.iluminacao.cenario;

    const artificial = new THREE.Color(COR_LUZ[c.iluminacao.temperatura]);
    const janela = new THREE.Color(k.janelaCor);
    const rebote = new THREE.Color(k.solCor);
    const acesa = (g: GrupoLuzLeve) => {
      if (g === 'janela' || g === 'rebote') return true;
      if (g === 'pendentes' && !c.composicao.ilha) return false;
      if (g === 'nichos' && c.composicao.aereos !== 'nicho') return false;
      return c.iluminacao.acesas[g];
    };
    const cor = (g: GrupoLuzLeve, intensidade: number) => {
      if (!acesa(g)) return corUm.setRGB(0, 0, 0);
      if (g === 'janela') return corUm.copy(janela).multiplyScalar(intensidade * k.janela);
      if (g === 'rebote') return corUm.copy(rebote).multiplyScalar(intensidade * k.rebote);
      return corUm.copy(artificial).multiplyScalar(intensidade);
    };
    // só as luzes acesas entram nos vetores: o laço do shader fica exatamente do tamanho necessário
    const u = materiais.uniformes;
    const eixo = new THREE.Vector3();
    let n = 0;
    for (const p of ambiente.pontos) {
      const l = cor(p.grupo, p.intensidade);
      if (n >= MAX_PONTOS || l.r + l.g + l.b < 0.001) continue;
      u.uPontoPos.value[n].set(p.pos[0], p.pos[1], p.pos[2], p.alcance);
      if (p.dir) {
        eixo.set(...p.dir).normalize();
        u.uPontoDir.value[n].set(eixo.x, eixo.y, eixo.z, p.cone ?? -2);
      } else u.uPontoDir.value[n].set(0, -1, 0, -2);
      u.uPontoCor.value[n++].set(l.r, l.g, l.b);
    }
    u.uNumPontos.value = n;
    n = 0;
    for (const p of ambiente.linhas) {
      const l = cor(p.grupo, p.intensidade);
      if (n >= MAX_LINHAS || l.r + l.g + l.b < 0.001) continue;
      u.uLinhaA.value[n].set(p.a[0], p.a[1], p.a[2], p.alcance);
      u.uLinhaB.value[n].set(...p.b);
      u.uLinhaDir.value[n].set(...p.dir).normalize();
      u.uLinhaCor.value[n++].set(l.r, l.g, l.b);
    }
    u.uNumLinhas.value = n;
    for (const l of listaLuzes) ambiente.visuais[l.id].forEach((v) => (v.visible = c.iluminacao.acesas[l.id]));
    ambiente.emissivos.forEach(({ material, forca }) => material.color.copy(artificial).lerp(BRANCO, 0.25).multiplyScalar(forca));
    if (solLigado) renderer.shadowMap.needsUpdate = true;
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
      const visiveis = ambiente.articulacoesVisiveis();
      ambiente.montagem.articulacoes.forEach((a) => {
        if (!visiveis.includes(a)) fecharJa(a);
      });
      eventos.articulacoes?.();
    }
    if (solLigado) renderer.shadowMap.needsUpdate = true;
    if (anterior) {
      // o que se reflete mudou: a sala é fotografada de novo. Com o cenário, o reflexo muda junto com a luz.
      if (anterior.iluminacao.cenario !== c.iluminacao.cenario) {
        atualizarSonda(1);
        agendarSonda(60);
      } else agendarSonda(140);
    }
    pedir();
  }

  /** Mostra outro acabamento sem gravar (pré-visualização ao passar o mouse na amostra). */
  function previsualizar(c: Config | null) {
    aplicarAcabamentos(c ?? config!);
    pedir();
  }

  /* ---------- sombra e reflexo ---------- */
  /** A sombra é recalculada dentro do render; só nesse quadro as paredes-sombra ficam ativas. */
  const comSombraAtualizada = (desenhar: () => void) => {
    const recalcular = renderer.shadowMap.needsUpdate && !!ambiente;
    if (recalcular) ambiente!.sombras.visible = true;
    desenhar();
    if (recalcular) ambiente!.sombras.visible = false;
  };

  const posSonda = new THREE.Vector3();
  function atualizarSonda(iteracoes: number) {
    if (!ambiente) return;
    ambiente.salaInteira(true);
    for (let i = 0; i < iteracoes; i++) {
      comSombraAtualizada(() => {
        const nova = pmrem.fromScene(cena, 0, 0.05, 30, { size: TAM_SONDA, position: posSonda });
        cena.environment = nova.texture;
        sonda.dispose();
        sonda = nova;
      });
    }
    ambiente.atualizarCortes(camera.position);
  }

  /* ---------- ambiente ---------- */
  /** Prepara todas as variantes de shader de uma vez, em paralelo: nenhuma troca trava depois. */
  async function prepararShaders() {
    const geo = new THREE.BoxGeometry(0.001, 0.001, 0.001);
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
    const mostruario = new THREE.Group();
    const variantes = [materiais.acabamento('freijo'), materiais.acabamento(idLaca('branco', 'fosco')), materiais.acabamento(idLaca('branco', 'acetinado')), materiais.acabamento('marmore'), materiais.metal('inox')];
    for (const mat of variantes) {
      const caixa = new THREE.Mesh(geo, mat);
      caixa.receiveShadow = true;
      caixa.castShadow = true;
      mostruario.add(caixa);
    }
    cena.add(mostruario);
    renderer.setRenderTarget(alvoCena);
    await renderer.compileAsync(cena, camera);
    renderer.setRenderTarget(null);
    cena.remove(mostruario);
    geo.dispose();
  }

  async function carregarAmbiente(id: IdAmbiente, c: Config) {
    const montar = await AMBIENTES[id]();
    if (ambiente) {
      cena.remove(ambiente.montagem.raiz);
      ambiente.dispose();
    }
    config = c;
    ambiente = montar({ materiais, leve, materialDe: (p) => materialDe(p) });
    ambiente.montagem.ritmo = opcoes.reduzido ? 0.35 : 1;
    idAmbiente = id;
    cena.add(ambiente.montagem.raiz);
    alvoMin.set(...ambiente.limitesAlvo.min);
    alvoMax.set(...ambiente.limitesAlvo.max);
    controles.minDistance = ambiente.distancia[0];
    controles.maxDistance = ambiente.distancia[1];
    const { sala } = ambiente;
    materiais.uniformes.uSalaMin.value.set(...sala.min);
    materiais.uniformes.uSalaMax.value.set(...sala.max);
    materiais.uniformes.uSondaPos.value.set(...sala.sonda);
    posSonda.set(...sala.sonda);
    aplicar(c, null);
    irPara('inicial', true);
    await prepararShaders();
    renderer.shadowMap.needsUpdate = true;
    atualizarSonda(2);
    desenharEmMovimento();
    calcularOclusao(); // a primeira passada também compila os passes da oclusão
    pedir();
    // as outras madeiras e pedras vêm em segundo plano: a troca fica instantânea
    const ocioso = (window as Window & { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1200));
    ocioso(() => materiais.precarregar(['carvalho', 'freijo', 'nogueira', 'nogueira-escura', 'marmore', 'quartzo', 'granito', 'pedra-escura']));
    eventos.articulacoes?.();
  }

  /* ---------- câmera: tudo por tempo real, nada depende da taxa de quadros ---------- */
  interface Voo {
    t: number;
    duracao: number;
    alvo0: THREE.Vector3;
    alvo1: THREE.Vector3;
    raio0: number;
    raio1: number;
    theta0: number;
    dTheta: number;
    phi0: number;
    phi1: number;
  }
  let voo: Voo | null = null;
  let zoomAlvo: number | null = null;
  let fusao = 0;
  const desloc = new THREE.Vector3();

  function irPara(vista: Vista, instantaneo = false) {
    if (!ambiente) return;
    const v = ambiente.vistas[vista];
    const alvoV = new THREE.Vector3(...v.alvo);
    const posV = new THREE.Vector3(...v.pos).sub(alvoV).multiplyScalar(fatorDistancia).add(alvoV);
    voo = null;
    zoomAlvo = null;
    if (instantaneo || opcoes.reduzido) {
      // movimento reduzido: a câmera não voa, a imagem anterior se dissolve na nova (só quando já há uma imagem pronta)
      if (!instantaneo && amostra > 0 && !comparacao) {
        fusao = 1;
        saida.uniforms.tEsquerda.value = alvoAcum.texture;
      }
      camera.position.copy(posV);
      controles.target.copy(alvoV);
      controles.update();
      pedir();
      return;
    }
    const s0 = new THREE.Spherical().setFromVector3(desloc.copy(camera.position).sub(controles.target));
    const s1 = new THREE.Spherical().setFromVector3(desloc.copy(posV).sub(alvoV));
    let dTheta = s1.theta - s0.theta;
    if (dTheta > Math.PI) dTheta -= Math.PI * 2;
    if (dTheta < -Math.PI) dTheta += Math.PI * 2;
    // caminho longo, voo um pouco mais longo: sem pressa e sem arrastar nos curtos
    const percurso = Math.abs(dTheta) + Math.abs(s1.phi - s0.phi) + Math.abs(Math.log(s1.radius / s0.radius)) * 0.6 + controles.target.distanceTo(alvoV) * 0.25;
    voo = {
      t: 0,
      duracao: THREE.MathUtils.clamp(0.85 + percurso * 0.42, 0.85, 1.7),
      alvo0: controles.target.clone(),
      alvo1: alvoV,
      raio0: s0.radius,
      raio1: s1.radius,
      theta0: s0.theta,
      dTheta,
      phi0: s0.phi,
      phi1: s1.phi,
    };
    pedir();
  }

  const atualizarVoo = (dt: number) => {
    if (!voo) return false;
    voo.t = Math.min(1, voo.t + dt / voo.duracao);
    const e = suave(voo.t);
    controles.target.lerpVectors(voo.alvo0, voo.alvo1, e);
    const raio = Math.exp(THREE.MathUtils.lerp(Math.log(voo.raio0), Math.log(voo.raio1), e));
    camera.position.setFromSphericalCoords(raio, THREE.MathUtils.lerp(voo.phi0, voo.phi1, e), voo.theta0 + voo.dTheta * e).add(controles.target);
    camera.lookAt(controles.target);
    if (voo.t >= 1) voo = null;
    return true;
  };

  function aproximar(fator: number) {
    voo = null;
    const atual = camera.position.distanceTo(controles.target);
    zoomAlvo = THREE.MathUtils.clamp((zoomAlvo ?? atual) * fator, controles.minDistance, controles.maxDistance);
    pedir();
  }

  const atualizarZoom = (dt: number) => {
    if (zoomAlvo === null) return false;
    desloc.copy(camera.position).sub(controles.target);
    const d = desloc.length();
    const proximo = Math.exp(THREE.MathUtils.lerp(Math.log(d), Math.log(zoomAlvo), 1 - Math.exp(-dt * (opcoes.reduzido ? 20 : 11))));
    if (Math.abs(proximo - zoomAlvo) < 0.002) {
      desloc.setLength(zoomAlvo);
      zoomAlvo = null;
    } else desloc.setLength(proximo);
    camera.position.copy(controles.target).add(desloc);
    return true;
  };

  /** O ponto de mira não sai do ambiente (deslocar a câmera não leva para "o nada"). */
  const preso = new THREE.Vector3();
  const prenderMira = () => {
    preso.copy(controles.target).clamp(alvoMin, alvoMax);
    if (preso.equals(controles.target)) return;
    camera.position.add(desloc.copy(preso).sub(controles.target));
    controles.target.copy(preso);
  };

  /** Colisão macia: a câmera é empurrada de volta, sem batida, se entrar nos móveis ou no piso. */
  const empurrarCamera = (dt: number) => {
    if (!ambiente || voo) return false;
    const p = camera.position;
    let mudou = false;
    if (p.y < 0.12) {
      p.y = 0.12;
      mudou = true;
    }
    const f = 1 - Math.exp(-dt * 14);
    for (const { min, max } of ambiente.zonas()) {
      if (p.x <= min[0] || p.x >= max[0] || p.y <= min[1] || p.y >= max[1] || p.z <= min[2] || p.z >= max[2]) continue;
      const saidas = [p.x - min[0], max[0] - p.x, p.z - min[2], max[2] - p.z, max[1] - p.y];
      const menor = Math.min(...saidas);
      const i = saidas.indexOf(menor);
      const passo = (menor + 0.01) * f;
      if (i === 0) p.x -= passo;
      else if (i === 1) p.x += passo;
      else if (i === 2) p.z -= passo;
      else if (i === 3) p.z += passo;
      else p.y += passo;
      mudou = true;
    }
    if (mudou) camera.lookAt(controles.target);
    return mudou;
  };

  // Rolagem: aproxima só com Ctrl/Cmd ou depois de clicar na cena (a rolagem comum continua
  // rolando a página). Em tela cheia, a rolagem sempre aproxima.
  let rodaLivre = false;
  let telaCheia = false;
  const aoRolar = (e: WheelEvent) => {
    if (!(telaCheia || rodaLivre || e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    // proporcional ao gesto: roda com degraus e trackpad ficam igualmente progressivos
    const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    aproximar(Math.exp(THREE.MathUtils.clamp(delta, -240, 240) * 0.0012));
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
  const solidos: THREE.Object3D[] = [];
  const tocar = (x: number, y: number): Articulacao | null => {
    if (!ambiente) return null;
    const r = canvas.getBoundingClientRect();
    ponteiro.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    raio.setFromCamera(ponteiro, camera);
    // vale o que está na frente: clicar na ilha não abre a gaveta que está atrás dela
    solidos.length = 0;
    ambiente.montagem.raiz.traverseVisible((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh && !(m.material as THREE.Material).transparent) solidos.push(m);
    });
    const acerto = raio.intersectObjects(solidos, false)[0];
    return (acerto?.object.userData.articulacao as Articulacao | undefined) ?? null;
  };
  canvas.addEventListener('pointerdown', (e) => {
    inicioToque = { x: e.clientX, y: e.clientY, t: performance.now() };
    rodaLivre = true;
    alvo.setAttribute('data-lenis-prevent', '');
    voo = null;
    zoomAlvo = null;
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
    quadroApontar = requestAnimationFrame((agora) => {
      if (agora - ultimaMudanca < 90) return; // com a cena em movimento, o rótulo espera
      const a = tocar(e.clientX, e.clientY);
      canvas.style.cursor = a ? 'pointer' : 'grab';
      eventos.apontar?.(a ? `${a.t > 0.5 ? 'Fechar' : 'Abrir'}: ${a.nome.toLowerCase()}` : null);
    });
  });

  function fecharJa(a: Articulacao) {
    a.alvo = 0;
    a.t = 0;
    a.espera = 0;
    a.internas.forEach((m) => (m.visible = false));
    if (a.eixo === 'z') a.no.position.z = a.base;
    else a.no.rotation[a.eixo] = a.base;
  }

  function alternar(id: string, abrir?: boolean, espera = 0) {
    const a = ambiente?.montagem.articulacoes.find((x) => x.id === id);
    if (!a) return;
    a.alvo = (abrir ?? a.alvo === 0) ? 1 : 0;
    a.espera = opcoes.reduzido ? 0 : espera;
    eventos.articulacoes?.();
    pedir();
  }

  function todas(abrir: boolean, tipo?: Articulacao['tipo']) {
    // em cascata, como quem abre um a um: nada começa no mesmo instante
    let i = 0;
    ambiente?.articulacoesVisiveis().forEach((a) => {
      if (!tipo || a.tipo === tipo || (tipo === 'porta' && a.tipo === 'basculante')) {
        if (a.t !== (abrir ? 1 : 0) || a.alvo !== (abrir ? 1 : 0)) alternar(a.id, abrir, i++ * 0.035);
      }
    });
  }

  /* ---------- desenho ---------- */
  let comparacao: { a: Config; divisor: number } | null = null;
  let amostra = 0;
  let capturando = false;
  let quadros = 0;

  const desenharCena = () => {
    renderer.setRenderTarget(alvoCena);
    comSombraAtualizada(() => renderer.render(cena, camera));
  };

  const apresentar = (tex: THREE.Texture, largVista = 0, altVista = 0) => {
    const u = saida.uniforms;
    u.tCor.value = tex;
    const parcial = largVista > 0 && (largVista !== alvoCena.width || altVista !== alvoCena.height);
    if (parcial) {
      // só parte do alvo foi usada: lê dentro dela, sem pegar a borda do que sobrou
      u.uEscala.value.set((largVista - 1) / alvoCena.width, (altVista - 1) / alvoCena.height);
      u.uDesloc.value.set(0.5 / alvoCena.width, 0.5 / alvoCena.height);
    } else {
      u.uEscala.value.set(1, 1);
      u.uDesloc.value.set(0, 0);
    }
    renderer.setRenderTarget(null);
    renderer.autoClear = false;
    quadSaida.render(renderer);
    renderer.autoClear = true;
    quadros++;
  };

  /** O lado A vai para o alvo de acumulação; o B fica no próprio alvo da cena. A saída junta os dois. */
  const desenharDividido = () => {
    if (!comparacao || !config) return;
    const W = alvoCena.width;
    const H = alvoCena.height;
    const x = Math.max(1, Math.round(W * comparacao.divisor));
    alvoCena.viewport.set(0, 0, W, H);
    alvoCena.scissorTest = true;
    aplicarAcabamentos(comparacao.a);
    alvoCena.scissor.set(0, 0, x, H);
    desenharCena();
    renderer.setRenderTarget(alvoAcum);
    renderer.autoClear = false;
    mistura.uniforms.tCor.value = alvoCena.texture;
    mistura.uniforms.uPeso.value = 1;
    quadMistura.render(renderer);
    renderer.autoClear = true;
    aplicarAcabamentos(config);
    alvoCena.scissor.set(x, 0, W - x, H);
    desenharCena();
    alvoCena.scissorTest = false;
    alvoCena.scissor.set(0, 0, W, H);
    saida.uniforms.tEsquerda.value = alvoAcum.texture;
    saida.uniforms.uDivisor.value = comparacao.divisor;
    saida.uniforms.uAO.value = 0;
    apresentar(alvoCena.texture);
    saida.uniforms.uDivisor.value = 0;
  };

  function desenharEmMovimento() {
    if (comparacao) {
      desenharDividido();
      return;
    }
    const W = alvoCena.width;
    const H = alvoCena.height;
    const vw = Math.max(1, Math.round(W * escala));
    const vh = Math.max(1, Math.round(H * escala));
    alvoCena.viewport.set(0, 0, vw, vh);
    desenharCena();
    saida.uniforms.uAO.value = 0;
    apresentar(alvoCena.texture, vw, vh);
    alvoCena.viewport.set(0, 0, W, H);
  }

  /** Oclusão de ambiente: um só quadro, com a câmera parada, sem os objetos translúcidos. */
  function calcularOclusao() {
    if (!ao) return;
    const ocultos: THREE.Object3D[] = [];
    cena.traverseVisible((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && (m.material as THREE.Material).transparent) ocultos.push(m);
    });
    ocultos.forEach((o) => (o.visible = false));
    ao.render(renderer, alvoCena, alvoCena, 0, false);
    ocultos.forEach((o) => (o.visible = true));
  }

  const eixoU = new THREE.Vector3();
  const eixoV = new THREE.Vector3();
  const CIMA = new THREE.Vector3(0, 1, 0);
  /** Uma amostra do refinamento: câmera e sol levemente deslocados, somados às anteriores. */
  const passoDeRefino = (i: number, total: number) => {
    if (!ambiente) return;
    const W = alvoCena.width;
    const H = alvoCena.height;
    alvoCena.viewport.set(0, 0, W, H);
    const luz = ambiente.sol.luz;
    if (i > 0) {
      camera.setViewOffset(W, H, halton(i, 2) - 0.5, halton(i, 3) - 0.5, W, H);
      if (solLigado && i % 2 === 1) {
        // penumbra: o sol não é um ponto. A cada duas amostras, ele é visto de outro lugar do disco solar
        // (refazer a sombra é a parte cara do refino).
        const k = (i + 1) / 2;
        const ang = halton(k, 2) * Math.PI * 2;
        const r = Math.sqrt(halton(k, 3)) * 0.34;
        eixoU.copy(solBase).sub(luz.target.position).normalize().cross(CIMA).normalize();
        eixoV.copy(eixoU).cross(solBase).normalize();
        luz.position.copy(solBase).addScaledVector(eixoU, Math.cos(ang) * r).addScaledVector(eixoV, Math.sin(ang) * r);
        renderer.shadowMap.needsUpdate = true;
      }
    }
    desenharCena();
    if (i > 0) {
      camera.clearViewOffset();
      luz.position.copy(solBase);
    }
    renderer.setRenderTarget(alvoAcum);
    renderer.autoClear = false;
    mistura.uniforms.tCor.value = alvoCena.texture;
    mistura.uniforms.uPeso.value = 1 / (i + 1);
    quadMistura.render(renderer);
    renderer.autoClear = true;
    if (i === 3) calcularOclusao();
    saida.uniforms.uAO.value = ao && i >= 3 ? FORCA_AO * suave(Math.min(1, (i - 2) / Math.max(1, total - 3))) : 0;
    apresentar(alvoAcum.texture);
  };

  /* ---------- ciclo sob demanda ---------- */
  let quadro = 0;
  let ativo = false;
  let ultimo = 0;
  let ultimaMudanca = 0;

  // Resolução dinâmica: reage ao tempo real entre quadros em movimento, não a um palpite sobre o aparelho.
  const ESCALA_MIN = 0.62;
  let ultimoMovel = 0;
  let estaveis = 0;
  let teto = 1; // nível que já se mostrou pesado demais: não volta a subir até ele, para não ficar oscilando
  let folga = 0;
  const intervalos: number[] = [];
  const medirIntervalo = (agora: number) => {
    const d = agora - ultimoMovel;
    ultimoMovel = agora;
    if (d > 100) return; // primeiro quadro de um movimento
    intervalos.push(d);
    if (intervalos.length < 24) return;
    const ordenados = [...intervalos].sort((a, b) => a - b);
    const mediana = ordenados[12];
    const p90 = ordenados[21]; // mediana boa com muitos quadros longos também é tranco
    intervalos.length = 0;
    if ((mediana > 19 || p90 > 28) && escala > ESCALA_MIN) {
      teto = escala * 0.98;
      escala = Math.max(ESCALA_MIN, escala * 0.88);
      estaveis = 0;
    } else if (mediana > 34 && alvoCena.samples > 0) {
      // último recurso, em GPUs muito limitadas: tira o MSAA do movimento (o refino continua suavizando)
      alvoCena.samples = 0;
      alvoCena.dispose();
    } else if (mediana < 18 && p90 < 22 && escala < teto) {
      if (++estaveis >= 3) {
        escala = Math.min(teto, escala * 1.08);
        estaveis = 0;
      }
    } else if (mediana < 18 && p90 < 22 && teto < 1) {
      // um pico passageiro (outro programa, por exemplo) não condena o resto da sessão: o teto se recupera devagar
      if (++folga >= 25) {
        teto = Math.min(1, teto * 1.06);
        folga = 0;
      }
    } else estaveis = 0;
  };

  const desenhar = (agora: number) => {
    if (!ativo) return;
    quadro = requestAnimationFrame(desenhar);
    const dt = Math.min(0.1, (agora - (ultimo || agora)) / 1000);
    ultimo = agora;
    if (!ambiente || capturando) return;
    if (dt > 0) controles.dampingFactor = 1 - Math.exp(-dt * 7);
    const voando = atualizarVoo(dt);
    const aproximando = atualizarZoom(dt);
    const fundindo = fusao > 0;
    if (fundindo) {
      fusao = Math.max(0, fusao - dt / 0.24);
      saida.uniforms.uFusao.value = fusao;
    }
    const orbitou = controles.update(dt);
    prenderMira();
    const empurrou = empurrarCamera(dt);
    const animando = ambiente.montagem.animar(dt);
    if (animando && solLigado) renderer.shadowMap.needsUpdate = true;
    const moveu = voando || aproximando || orbitou || empurrou || animando || fundindo;
    if (moveu || precisa) {
      precisa = false;
      // o sol volta ao centro do disco: a sombra do movimento não fica presa à última amostra
      if (amostra > 1 && solLigado) renderer.shadowMap.needsUpdate = true;
      ambiente.atualizarCortes(camera.position);
      desenharEmMovimento();
      amostra = 0;
      ultimaMudanca = agora;
      if (moveu) medirIntervalo(agora);
      return;
    }
    if (sondaEm && performance.now() >= sondaEm) {
      sondaEm = 0;
      atualizarSonda(1);
      pedir();
      return;
    }
    if (amostra < AMOSTRAS && !comparacao && agora - ultimaMudanca > 110) {
      passoDeRefino(amostra++, AMOSTRAS);
      return;
    }
    const textura = filaTexturas.shift();
    if (textura) renderer.initTexture(textura);
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

  observadorTamanho.observe(alvo);
  ajustarTamanho(); // já mede agora: o primeiro aviso do ResizeObserver só vem no próximo quadro

  /* ---------- captura da cena (sem a interface): acumula em alta resolução sem travar a página ---------- */
  async function capturar(larguraAlvo = 2000): Promise<Blob | null> {
    if (!config || !ambiente || capturando) return null;
    capturando = true;
    fusao = 0;
    saida.uniforms.uFusao.value = 0;
    const pr = renderer.getPixelRatio();
    const fator = THREE.MathUtils.clamp(larguraAlvo / Math.max(1, largura), 1, leve ? 2 : 3);
    const antes = comparacao;
    comparacao = null;
    if (antes) aplicarAcabamentos(config);
    renderer.setPixelRatio(fator);
    renderer.setSize(largura, altura, false);
    dimensionarAlvos(Math.round(largura * fator), Math.round(altura * fator));
    ambiente.atualizarCortes(camera.position);
    const total = leve ? 6 : 14;
    for (let i = 0; i < total; i++) {
      passoDeRefino(i, total);
      await new Promise((r) => setTimeout(r));
    }
    // desenhar e ler no mesmo instante: o conteúdo do canvas só vale até o navegador compor o quadro
    apresentar(alvoAcum.texture);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
    comparacao = antes;
    renderer.setPixelRatio(pr);
    renderer.setSize(largura, altura, false);
    dimensionarAlvos(Math.round(largura * pr), Math.round(altura * pr));
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    renderer.shadowMap.needsUpdate = solLigado;
    amostra = 0;
    capturando = false;
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
      teto = 1;
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
        atualizarVoo(dt);
        atualizarZoom(dt);
        controles.update();
        prenderMira();
        if (ambiente.montagem.animar(dt) && solLigado) renderer.shadowMap.needsUpdate = true;
      }
      ambiente.atualizarCortes(camera.position);
      if (sondaEm) {
        sondaEm = 0;
        atualizarSonda(1);
      }
      amostra = 0;
      for (let i = 0; i < AMOSTRAS; i++) passoDeRefino(amostra++, AMOSTRAS);
      precisa = false;
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
    /** só em desenvolvimento: acesso direto para experimentos de desempenho no console */
    _interno() {
      return import.meta.env.DEV ? { renderer, cena, camera, alvoCena, alvoAcum, materiais, ambiente, desenharCena, desenharEmMovimento, definirEscala: (v: number) => (escala = v) } : null;
    },
    /** só em desenvolvimento: enquadra um ponto de vista qualquer, para conferir detalhes */
    olhar(pos: [number, number, number], mira: [number, number, number]) {
      if (!import.meta.env.DEV) return;
      voo = null;
      zoomAlvo = null;
      camera.position.set(...pos);
      controles.target.set(...mira);
      controles.update();
      pedir();
    },
    /** só em desenvolvimento: mede custos reais da GPU (cada quadro é sincronizado com readPixels) */
    diagnostico() {
      if (!import.meta.env.DEV || !ambiente || !config) return null;
      const gl = renderer.getContext();
      const px = new Uint8Array(4);
      const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const resumo = (a: number[]) => {
        const o = [...a].sort((x, y) => x - y);
        return { med: +o[Math.floor(o.length / 2)].toFixed(1), p95: +o[Math.floor(o.length * 0.95)].toFixed(1), max: +o[o.length - 1].toFixed(1) };
      };
      const estavaAtivo = ativo;
      pausar();
      const pos0 = camera.position.clone();
      const escala0 = escala;
      escala = 1;
      const girar = (i: number) => {
        const d = pos0.clone().sub(controles.target);
        d.applyAxisAngle(new THREE.Vector3(0, 1, 0), (i / 60) * 0.6);
        camera.position.copy(controles.target).add(d);
        camera.lookAt(controles.target);
      };
      const medir = (n: number, f: (i: number) => void) => {
        const a: number[] = [];
        for (let i = 0; i < n; i++) {
          girar(i);
          const t = performance.now();
          f(i);
          sync();
          a.push(performance.now() - t);
        }
        return resumo(a);
      };
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const contagem: Record<string, number> = {};
      const materiaisUnicos = new Set<string>();
      cena.traverse((o) => {
        const tipo = (o as THREE.Light).isLight ? o.type : (o as THREE.Mesh).isMesh ? 'Mesh' : null;
        if (tipo) contagem[tipo] = (contagem[tipo] ?? 0) + 1;
        const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (mat?.uuid) materiaisUnicos.add(`${mat.type}`);
      });
      const r: Record<string, unknown> = {
        gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'desconhecida',
        canvas: [canvas.width, canvas.height],
        pixelRatio: renderer.getPixelRatio(),
        msaa: alvoCena.samples,
        contagem,
        tiposDeMaterial: [...materiaisUnicos],
      };
      desenharCena();
      r.chamadas = renderer.info.render.calls;
      r.triangulos = renderer.info.render.triangles;
      r.programas = renderer.info.programs?.length ?? 0;
      r.quadroEmMovimento = medir(60, () => desenharEmMovimento());
      r.quadroComSombra = medir(20, () => {
        renderer.shadowMap.needsUpdate = true;
        desenharEmMovimento();
      });
      r.amostraDeRefino = medir(16, (i) => passoDeRefino(i + 1, AMOSTRAS));
      if (ao) r.oclusaoUmaVez = medir(5, () => calcularOclusao());
      r.sondaDeReflexo = medir(5, () => atualizarSonda(1));
      // soluço ao trocar: antes, mudar o número de luzes recompilava todos os shaders
      const c0 = config;
      const trocar = (f: (c: Config) => void) => {
        const c = structuredClone(c0);
        f(c);
        const t = performance.now();
        aplicar(c, c0);
        desenharEmMovimento();
        sync();
        return +(performance.now() - t).toFixed(1);
      };
      r.trocaLigaSpots = trocar((c) => (c.iluminacao.acesas.spots = !c.iluminacao.acesas.spots));
      r.trocaVoltaSpots = trocar(() => undefined);
      r.trocaCenarioNoite = trocar((c) => (c.iluminacao.cenario = 'noite'));
      r.trocaVoltaCenario = trocar(() => undefined);
      r.trocaMaterial = trocar((c) => (c.acabamentos.portas = 'nogueira'));
      r.trocaVoltaMaterial = trocar(() => undefined);
      r.trocaPuxador = trocar((c) => (c.puxador.tipo = 'barra'));
      r.trocaVoltaPuxador = trocar(() => undefined);
      aplicar(c0, null);
      camera.position.copy(pos0);
      controles.update();
      escala = escala0;
      if (estavaAtivo) retomar();
      return r;
    },
    /** só em desenvolvimento: gira a câmera em tempo real e registra o intervalo entre quadros */
    async medirFluidez(ms = 3000) {
      if (!import.meta.env.DEV) return null;
      const pos0 = camera.position.clone();
      const a: number[] = [];
      const inicio = performance.now();
      let ultimoQ = inicio;
      await new Promise<void>((fim) => {
        const passo = () => {
          const agora = performance.now();
          a.push(agora - ultimoQ);
          ultimoQ = agora;
          const d = pos0.clone().sub(controles.target);
          d.applyAxisAngle(new THREE.Vector3(0, 1, 0), ((agora - inicio) / ms) * 0.9);
          camera.position.copy(controles.target).add(d);
          pedir();
          if (agora - inicio < ms) requestAnimationFrame(passo);
          else fim();
        };
        requestAnimationFrame(passo);
      });
      const escalaFinal = escala;
      camera.position.copy(pos0);
      pedir();
      const o = [...a].sort((x, y) => x - y);
      return {
        quadros: a.length,
        fps: +((a.length * 1000) / ms).toFixed(1),
        intervaloMed: +o[Math.floor(o.length / 2)].toFixed(1),
        p95: +o[Math.floor(o.length * 0.95)].toFixed(1),
        max: +o[o.length - 1].toFixed(1),
        acimaDe33ms: a.filter((x) => x > 33.4).length,
        escalaFinal: +escalaFinal.toFixed(2),
      };
    },
    /** quantos quadros já foram desenhados (para conferir que nada é desenhado à toa) */
    quadrosDesenhados: () => quadros,
    /** números de desempenho, medidos num quadro direto, para conferência */
    estatisticas() {
      desenharCena();
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
        escala,
        amostra,
      };
    },
    destruir() {
      pausar();
      voo = null;
      observadorTamanho.disconnect();
      observadorVisivel.disconnect();
      document.removeEventListener('visibilitychange', aoMudarAba);
      canvas.removeEventListener('wheel', aoRolar);
      canvas.removeEventListener('pointerleave', sairDaCena);
      controles.dispose();
      ao?.dispose();
      quadSaida.dispose();
      quadMistura.dispose();
      saida.dispose();
      mistura.dispose();
      alvoCena.dispose();
      alvoAcum.dispose();
      if (ambiente) {
        cena.remove(ambiente.montagem.raiz);
        ambiente.dispose();
      }
      ambiente = null;
      materiais.dispose();
      cena.environment = null;
      sonda.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

export type Motor = ReturnType<typeof criarMotor>;
