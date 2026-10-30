import * as THREE from 'three';
import { cores, lerLaca, madeiras, metais, type MetalPuxador } from './catalogo';

/*
 * Biblioteca central de materiais. Cada acabamento vira um único material compartilhado por todas
 * as peças que o usam (trocar um acabamento = trocar a referência, sem recriar geometria).
 *
 * Coordenadas de textura em METROS (ver projetarUV em moveis.ts): o "repeat" de cada textura diz
 * quantos metros uma imagem cobre, então o veio tem a mesma escala em qualquer peça.
 *
 * ILUMINAÇÃO EM DUAS CAMADAS (decisão tomada a partir de medição, ver README):
 * - só o sol é uma luz completa do three.js (com sombra);
 * - spots, pendentes, fitas de LED e janela são calculados aqui, só na parte difusa, num laço curto
 *   controlado por uniforms. Ligar e desligar muda um número: NÃO recompila shader nenhum;
 * - o brilho (especular) vem da sonda de reflexo da própria sala, com projeção em caixa, que coloca
 *   a janela e as luzes refletidas no lugar certo do piso, da pedra e dos metais.
 */

export const MAX_PONTOS = 9;
export const MAX_LINHAS = 3;

const PARS_VERTICE = /* glsl */ `
varying vec3 vPosMundo;
`;
const CALC_VERTICE = /* glsl */ `
	{
		vec4 posicaoLocal = vec4( transformed, 1.0 );
		#ifdef USE_INSTANCING
			posicaoLocal = instanceMatrix * posicaoLocal;
		#endif
		vPosMundo = ( modelMatrix * posicaoLocal ).xyz;
	}
`;

const PARS_FRAGMENTO = /* glsl */ `
varying vec3 vPosMundo;
uniform vec4 uPontoPos[ ${MAX_PONTOS} ]; // xyz posição, w alcance
uniform vec4 uPontoDir[ ${MAX_PONTOS} ]; // xyz eixo, w cosseno do cone (<= -1: luz em todas as direções)
uniform vec3 uPontoCor[ ${MAX_PONTOS} ];
uniform vec4 uLinhaA[ ${MAX_LINHAS} ];   // xyz início, w alcance
uniform vec3 uLinhaB[ ${MAX_LINHAS} ];
uniform vec3 uLinhaDir[ ${MAX_LINHAS} ];
uniform vec3 uLinhaCor[ ${MAX_LINHAS} ];
uniform int uNumPontos; // só as acesas, em sequência: luz apagada não custa nada
uniform int uNumLinhas;
uniform vec3 uSalaMin;
uniform vec3 uSalaMax;
uniform vec3 uSondaPos;

// Reflexo com projeção em caixa: corrige a direção pelo ponto da sala, sem nenhum passe extra.
vec3 projetarNaSala( vec3 r, vec3 p ) {
	vec3 ate = max( ( uSalaMax - p ) / r, ( uSalaMin - p ) / r );
	float d = min( min( ate.x, ate.y ), ate.z );
	if ( d <= 0.0 || d > 40.0 ) return r;
	return normalize( p + r * d - uSondaPos );
}

// Luz difusa dos pontos e das fitas: atenuação suave até zero no alcance.
vec3 luzDifusaSala( vec3 p, vec3 n ) {
	vec3 soma = vec3( 0.0 );
	for ( int i = 0; i < uNumPontos; i ++ ) {
		vec3 c = uPontoCor[ i ];
		vec3 L = uPontoPos[ i ].xyz - p;
		float d2 = dot( L, L );
		float a = uPontoPos[ i ].w;
		float f = clamp( 1.0 - d2 / ( a * a ), 0.0, 1.0 );
		if ( f <= 0.0 ) continue;
		L /= sqrt( d2 );
		float cone = uPontoDir[ i ].w <= - 1.0 ? 1.0 : smoothstep( uPontoDir[ i ].w, uPontoDir[ i ].w + 0.22, dot( - L, uPontoDir[ i ].xyz ) );
		soma += c * max( dot( n, L ), 0.0 ) * cone * f * f / ( d2 + 0.25 );
	}
	for ( int i = 0; i < uNumLinhas; i ++ ) {
		vec3 c = uLinhaCor[ i ];
		vec3 a = uLinhaA[ i ].xyz;
		vec3 ab = uLinhaB[ i ] - a;
		float t = clamp( dot( p - a, ab ) / dot( ab, ab ), 0.0, 1.0 );
		vec3 L = a + ab * t - p;
		float d2 = dot( L, L );
		float alc = uLinhaA[ i ].w;
		float f = clamp( 1.0 - d2 / ( alc * alc ), 0.0, 1.0 );
		if ( f <= 0.0 ) continue;
		L /= sqrt( d2 );
		soma += c * max( dot( n, L ), 0.0 ) * max( dot( - L, uLinhaDir[ i ] ), 0.0 ) * f * f / ( d2 + 0.04 );
	}
	return soma;
}
`;

const CALC_FRAGMENTO = /* glsl */ `
	{
		vec3 normalMundo = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
		reflectedLight.directDiffuse += luzDifusaSala( vPosMundo, normalMundo ) * BRDF_Lambert( material.diffuseContribution );
	}
`;

interface Lamina {
  arquivo: string;
  /** a foto da lâmina tem o veio na horizontal: gira 90° para o veio correr ao longo de "v" */
  girar: boolean;
  /** correção de tom sobre a foto crua (vem do catálogo, para a miniatura bater com o 3D) */
  tom: string;
  rugosidade: number;
}

const tomDe = (id: string) => madeiras.find((x) => x.id === id)?.tom ?? '#ffffff';
const LAMINAS: Record<string, Lamina> = {
  carvalho: { arquivo: 'carvalho', girar: false, tom: tomDe('carvalho'), rugosidade: 0.82 },
  freijo: { arquivo: 'freijo', girar: true, tom: tomDe('freijo'), rugosidade: 0.8 },
  nogueira: { arquivo: 'nogueira', girar: true, tom: tomDe('nogueira'), rugosidade: 0.76 },
  'nogueira-escura': { arquivo: 'nogueira', girar: true, tom: tomDe('nogueira-escura'), rugosidade: 0.72 },
};

const PEDRAS: Record<string, { arquivo: string; metros: number; rugosidade: number; verniz: number }> = {
  marmore: { arquivo: 'marmore-claro', metros: 1.9, rugosidade: 0.17, verniz: 0.5 },
  quartzo: { arquivo: 'quartzo-branco', metros: 0.9, rugosidade: 0.26, verniz: 0.3 },
  granito: { arquivo: 'granito-claro', metros: 0.9, rugosidade: 0.2, verniz: 0.45 },
  'pedra-escura': { arquivo: 'pedra-escura', metros: 1.5, rugosidade: 0.14, verniz: 0.55 },
};

const METROS_LAMINA = 1.2;

export interface OpcoesMateriais {
  leve: boolean;
  anisotropia: number;
  aoMudar: () => void;
  aoChegarTextura?: (t: THREE.Texture) => void;
}

export function criarMateriais(o: OpcoesMateriais) {
  const gerenciador = new THREE.LoadingManager();
  const carregador = new THREE.TextureLoader(gerenciador);
  // Em aparelhos limitados as texturas vêm na versão de 512 px (pasta /512).
  const pasta = o.leve ? '/3d/texturas/512' : '/3d/texturas';
  const texturas = new Map<string, Promise<THREE.Texture>>();
  const criadas: THREE.Texture[] = [];
  let pendentes = 0;
  const ouvintesCarga = new Set<(pendentes: number) => void>();
  const avisarCarga = () => ouvintesCarga.forEach((f) => f(pendentes));

  /* ---------- uniforms compartilhados por todos os materiais ---------- */
  const uniformes = {
    uPontoPos: { value: Array.from({ length: MAX_PONTOS }, () => new THREE.Vector4()) },
    uPontoDir: { value: Array.from({ length: MAX_PONTOS }, () => new THREE.Vector4(0, -1, 0, -2)) },
    uPontoCor: { value: Array.from({ length: MAX_PONTOS }, () => new THREE.Vector3()) },
    uLinhaA: { value: Array.from({ length: MAX_LINHAS }, () => new THREE.Vector4()) },
    uLinhaB: { value: Array.from({ length: MAX_LINHAS }, () => new THREE.Vector3(0, 0, 1)) },
    uLinhaDir: { value: Array.from({ length: MAX_LINHAS }, () => new THREE.Vector3(0, -1, 0)) },
    uLinhaCor: { value: Array.from({ length: MAX_LINHAS }, () => new THREE.Vector3()) },
    uNumPontos: { value: 0 },
    uNumLinhas: { value: 0 },
    uSalaMin: { value: new THREE.Vector3(-50, -50, -50) },
    uSalaMax: { value: new THREE.Vector3(50, 50, 50) },
    uSondaPos: { value: new THREE.Vector3() },
  };

  /** Injeta as luzes leves e o reflexo projetado. Toda a biblioteca passa por aqui. */
  function comLuzDaSala<T extends THREE.MeshStandardMaterial>(m: T): T {
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniformes);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${PARS_VERTICE}`)
        .replace('#include <project_vertex>', `#include <project_vertex>\n${CALC_VERTICE}`);
      const envProjetado = THREE.ShaderChunk.envmap_physical_pars_fragment.replace(
        'reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );',
        'reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );\n\t\t\treflectVec = projetarNaSala( reflectVec, vPosMundo );',
      );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${PARS_FRAGMENTO}`)
        .replace('#include <envmap_physical_pars_fragment>', envProjetado)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${CALC_FRAGMENTO}`);
    };
    // todos usam a mesma injeção: mesmo programa quando os demais recursos coincidem
    m.customProgramCacheKey = () => 'nova-era-sala-1';
    return m;
  }

  /** Carrega (uma vez) e configura uma textura; metros = tamanho que a imagem cobre. */
  function textura(nome: string, cor: boolean, metros: number, girar = false) {
    const chave = `${nome}|${metros}|${girar}`;
    let p = texturas.get(chave);
    if (!p) {
      pendentes++;
      avisarCarga();
      p = new Promise<THREE.Texture>((resolver) => {
        carregador.load(
          `${pasta}/${nome}.webp`,
          (t) => {
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.colorSpace = cor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
            // filtro forte só na cor: em relevo e rugosidade quase não se vê, e custa caro em GPU integrada
            t.anisotropy = cor ? o.anisotropia : Math.min(o.anisotropia, 2);
            t.repeat.set(1 / metros, 1 / metros);
            if (girar) {
              t.center.set(0.5, 0.5);
              t.rotation = Math.PI / 2;
            }
            criadas.push(t);
            o.aoChegarTextura?.(t);
            pendentes--;
            avisarCarga();
            resolver(t);
          },
          undefined,
          () => {
            // Falha de rede: a superfície fica com a cor de amostra (não quebra a cena).
            pendentes--;
            avisarCarga();
            resolver(new THREE.Texture());
          },
        );
      });
      texturas.set(chave, p);
    }
    return p;
  }

  const microRelevo = (metros: number) => textura('laca-normal', false, metros);
  // textura neutra enquanto a verdadeira não chega: o shader já nasce com os mapas (sem recompilar depois)
  const branco = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  branco.needsUpdate = true;
  const normalPlano = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  normalPlano.needsUpdate = true;

  const cache = new Map<string, THREE.MeshStandardMaterial>();

  function madeira(id: string) {
    const l = LAMINAS[id];
    const m = comLuzDaSala(
      new THREE.MeshStandardMaterial({
        name: id,
        roughness: l.rugosidade,
        vertexColors: true, // variação sutil de tom entre as peças (ver moveis.ts)
        map: branco,
        normalMap: normalPlano,
        roughnessMap: branco,
      }),
    );
    // Enquanto as imagens não chegam, a peça fica no tom médio da madeira.
    m.color.copy(new THREE.Color(l.tom).multiply(new THREE.Color('#b98d64')));
    Promise.all([
      textura(`lamina-${l.arquivo}-cor`, true, METROS_LAMINA, l.girar),
      textura(`lamina-${l.arquivo}-normal`, false, METROS_LAMINA, l.girar),
      textura(`lamina-${l.arquivo}-rug`, false, METROS_LAMINA, l.girar),
    ]).then(([cor, normal, rug]) => {
      m.map = cor;
      m.normalMap = normal;
      m.normalScale.set(0.55, 0.55);
      m.roughnessMap = rug;
      m.color.set(l.tom);
      m.needsUpdate = true;
      o.aoMudar();
    });
    return m;
  }

  function laca(corId: string, brilho: string) {
    const c = cores.find((x) => x.id === corId) ?? cores[0];
    const acetinado = brilho === 'acetinado';
    const m = comLuzDaSala(
      acetinado
        ? new THREE.MeshPhysicalMaterial({
            name: `laca-${corId}-acetinado`,
            color: c.hex,
            roughness: 0.42,
            clearcoat: 0.55,
            clearcoatRoughness: 0.22,
            normalMap: normalPlano,
          })
        : new THREE.MeshStandardMaterial({ name: `laca-${corId}-fosco`, color: c.hex, roughness: 0.68, normalMap: normalPlano }),
    );
    microRelevo(0.35).then((t) => {
      m.normalMap = t;
      m.normalScale.set(acetinado ? 0.035 : 0.09, acetinado ? 0.035 : 0.09);
      m.needsUpdate = true;
      o.aoMudar();
    });
    return m;
  }

  function pedra(id: string) {
    const p = PEDRAS[id];
    const m = comLuzDaSala(
      new THREE.MeshPhysicalMaterial({
        name: id,
        color: '#ffffff',
        roughness: p.rugosidade,
        clearcoat: p.verniz,
        clearcoatRoughness: 0.06,
        map: branco,
      }),
    );
    textura(p.arquivo, true, p.metros).then((t) => {
      m.map = t;
      m.needsUpdate = true;
      o.aoMudar();
    });
    return m;
  }

  /** Material de um acabamento do catálogo (madeira, laca ou pedra), sempre o mesmo objeto por id. */
  function acabamento(id: string): THREE.MeshStandardMaterial {
    let m = cache.get(id);
    if (m) return m;
    const lacaInfo = lerLaca(id);
    if (lacaInfo) m = laca(lacaInfo.cor, lacaInfo.brilho);
    else if (PEDRAS[id]) m = pedra(id);
    else m = madeira(LAMINAS[id] ? id : 'freijo');
    cache.set(id, m);
    return m;
  }

  /* ---------- metais: cada um com a própria resposta à luz ---------- */
  const metaisCache = new Map<MetalPuxador, THREE.MeshStandardMaterial>();
  function metal(id: MetalPuxador) {
    let m = metaisCache.get(id);
    if (m) return m;
    const hex = metais.find((x) => x.id === id)?.hex ?? '#b9bbbd';
    const config: Record<MetalPuxador, THREE.MeshStandardMaterialParameters> = {
      aluminio: { metalness: 1, roughness: 0.42, normalMap: normalPlano },
      inox: { metalness: 1, roughness: 0.14, normalMap: normalPlano },
      preto: { metalness: 0.4, roughness: 0.5, normalMap: normalPlano },
      dourado: { metalness: 1, roughness: 0.32, normalMap: normalPlano },
    };
    const criado = comLuzDaSala(new THREE.MeshStandardMaterial({ name: `metal-${id}`, color: hex, ...config[id] }));
    if (id === 'aluminio' || id === 'dourado') {
      textura('escovado-normal', false, 1).then((t) => {
        criado.normalMap = t;
        criado.normalScale.set(0.3, 0.3);
        criado.needsUpdate = true;
        o.aoMudar();
      });
    }
    metaisCache.set(id, criado);
    return criado;
  }

  /* ---------- materiais fixos do ambiente (não configuráveis) ---------- */
  const padrao = (p: THREE.MeshStandardMaterialParameters) => comLuzDaSala(new THREE.MeshStandardMaterial(p));
  const fixos = {
    parede: padrao({ name: 'parede', color: '#eeeeeb', roughness: 0.9, normalMap: normalPlano }),
    teto: padrao({ name: 'teto', color: '#f5f5f3', roughness: 0.92 }),
    rodapeParede: padrao({ name: 'rodape-parede', color: '#f2f0ec', roughness: 0.55 }),
    corte: padrao({ name: 'corte', color: '#2b2f3a', roughness: 0.9 }),
    piso: padrao({ name: 'piso', color: '#eef1f4', roughness: 1, map: branco, roughnessMap: branco }),
    sombra: padrao({ name: 'sombra', color: '#101012', roughness: 0.9 }),
    interior: padrao({ name: 'interior', color: '#ecebe6', roughness: 0.62 }),
    ferragem: padrao({ name: 'ferragem', color: '#b9bbbe', metalness: 1, roughness: 0.38 }),
    inox: padrao({ name: 'inox', color: '#d2d3d5', metalness: 1, roughness: 0.34 }),
    aluminioPerfil: padrao({ name: 'aluminio-perfil', color: '#b3b5b8', metalness: 1, roughness: 0.46 }),
    caixilho: padrao({ name: 'caixilho', color: '#1c1d1f', metalness: 0.5, roughness: 0.48 }),
    vidroPreto: padrao({ name: 'vidro-preto', color: '#08090b', roughness: 0.05, metalness: 0.1 }),
    vidro: padrao({ name: 'vidro', color: '#e8f0f2', roughness: 0.03, metalness: 0, transparent: true, opacity: 0.1, depthWrite: false }),
    vidroPrateleira: padrao({ name: 'vidro-prateleira', color: '#d6e3e2', roughness: 0.05, transparent: true, opacity: 0.3, depthWrite: false }),
    cortina: padrao({ name: 'cortina', color: '#f7f4ee', roughness: 1, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false }),
    tecido: padrao({ name: 'tecido', color: '#c9bba8', roughness: 1, map: branco }),
    ceramica: padrao({ name: 'ceramica', color: '#e9e4dc', roughness: 0.34 }),
    ceramicaEscura: padrao({ name: 'ceramica-escura', color: '#4a4540', roughness: 0.55 }),
    terra: padrao({ name: 'terra', color: '#2c231b', roughness: 1 }),
    pretoFosco: padrao({ name: 'preto-fosco', color: '#17171a', roughness: 0.5, metalness: 0.25 }),
    fruta: padrao({ name: 'fruta', color: '#e2913b', roughness: 0.42 }),
    limao: padrao({ name: 'limao', color: '#93b04a', roughness: 0.42 }),
    folha: padrao({ name: 'folha', color: '#5c7445', roughness: 0.58, side: THREE.DoubleSide }),
    galho: padrao({ name: 'galho', color: '#5b4a3a', roughness: 0.9 }),
    livro: padrao({ name: 'livro', color: '#8a7d6c', roughness: 0.8 }),
    livro2: padrao({ name: 'livro-2', color: '#3e4a5e', roughness: 0.8 }),
    tomada: padrao({ name: 'tomada', color: '#f1f0ec', roughness: 0.35 }),
    // Sem cálculo de luz. Valores acima de 1: a sala é renderizada em HDR e a saída faz o mapeamento de tons.
    exterior: new THREE.MeshBasicMaterial({ name: 'exterior', color: '#ffffff' }),
    led: new THREE.MeshBasicMaterial({ name: 'led', color: '#ffffff' }),
    luminaria: new THREE.MeshBasicMaterial({ name: 'luminaria', color: '#ffffff' }),
    spot: new THREE.MeshBasicMaterial({ name: 'spot', color: '#ffffff' }),
    indireta: new THREE.MeshBasicMaterial({ name: 'indireta', color: '#ffffff', vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    geladeira: new THREE.MeshBasicMaterial({ name: 'luz-geladeira', color: new THREE.Color(5, 5.2, 5.6) }),
    // Sombras de contato pintadas nas junções: gradiente por vértice, multiplicado sobre o que está atrás.
    contato: new THREE.MeshBasicMaterial({
      name: 'contato',
      vertexColors: true,
      transparent: true,
      blending: THREE.MultiplyBlending,
      premultipliedAlpha: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  };
  Promise.all([textura('piso-cor', true, 3.6), textura('piso-rug', false, 3.6), textura('gesso-normal', false, 1.4)]).then(([piso, rug, gesso]) => {
    fixos.piso.map = piso;
    fixos.piso.roughnessMap = rug;
    fixos.parede.normalMap = gesso;
    fixos.parede.normalScale.set(0.22, 0.22);
    fixos.piso.needsUpdate = fixos.parede.needsUpdate = true;
    o.aoMudar();
  });
  textura('tecido', true, 0.12).then((t) => {
    fixos.tecido.map = t;
    fixos.tecido.needsUpdate = true;
    o.aoMudar();
  });

  return {
    acabamento,
    metal,
    fixos,
    uniformes,
    /** Começa a baixar as texturas de outros acabamentos (troca instantânea depois). */
    precarregar(ids: string[]) {
      ids.forEach((id) => acabamento(id));
    },
    pendentes: () => pendentes,
    aoCarregar(f: (pendentes: number) => void) {
      ouvintesCarga.add(f);
      return () => ouvintesCarga.delete(f);
    },
    dispose() {
      cache.forEach((m) => m.dispose());
      metaisCache.forEach((m) => m.dispose());
      Object.values(fixos).forEach((m) => m.dispose());
      criadas.forEach((t) => t.dispose());
      branco.dispose();
      normalPlano.dispose();
      cache.clear();
      metaisCache.clear();
    },
  };
}

export type Materiais = ReturnType<typeof criarMateriais>;
