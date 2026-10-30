import * as THREE from 'three';
import { cores, lerLaca, madeiras, metais, type MetalPuxador } from './catalogo';

/*
 * Biblioteca central de materiais. Cada acabamento vira um único material compartilhado por todas
 * as peças que o usam (trocar um acabamento = trocar a referência, sem recriar geometria).
 *
 * Coordenadas de textura em METROS (ver projetarUV em moveis.ts): o "repeat" de cada textura diz
 * quantos metros uma imagem cobre, então o veio tem a mesma escala em qualquer peça.
 */

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
  carvalho: { arquivo: 'carvalho', girar: false, tom: tomDe('carvalho'), rugosidade: 0.8 },
  freijo: { arquivo: 'freijo', girar: true, tom: tomDe('freijo'), rugosidade: 0.78 },
  nogueira: { arquivo: 'nogueira', girar: true, tom: tomDe('nogueira'), rugosidade: 0.74 },
  'nogueira-escura': { arquivo: 'nogueira', girar: true, tom: tomDe('nogueira-escura'), rugosidade: 0.7 },
};

const PEDRAS: Record<string, { arquivo: string; metros: number; rugosidade: number; verniz: number }> = {
  marmore: { arquivo: 'marmore-claro', metros: 1.8, rugosidade: 0.16, verniz: 0.5 },
  quartzo: { arquivo: 'quartzo-branco', metros: 0.9, rugosidade: 0.24, verniz: 0.35 },
  granito: { arquivo: 'granito-claro', metros: 0.9, rugosidade: 0.2, verniz: 0.45 },
  'pedra-escura': { arquivo: 'pedra-escura', metros: 0.9, rugosidade: 0.18, verniz: 0.5 },
};

const METROS_LAMINA = 1.2;

export interface OpcoesMateriais {
  leve: boolean;
  anisotropia: number;
  aoMudar: () => void;
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
            t.anisotropy = o.anisotropia;
            t.repeat.set(1 / metros, 1 / metros);
            if (girar) {
              t.center.set(0.5, 0.5);
              t.rotation = Math.PI / 2;
            }
            criadas.push(t);
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

  const cache = new Map<string, THREE.MeshPhysicalMaterial>();

  function madeira(id: string) {
    const l = LAMINAS[id];
    const m = new THREE.MeshPhysicalMaterial({
      name: id,
      color: l.tom,
      roughness: l.rugosidade,
      clearcoat: 0.12,
      clearcoatRoughness: 0.55,
    });
    // Enquanto as imagens não chegam, a peça fica no tom médio da madeira.
    const tomMedio = new THREE.Color(l.tom).multiply(new THREE.Color('#b98d64'));
    m.color.copy(tomMedio);
    Promise.all([
      textura(`lamina-${l.arquivo}-cor`, true, METROS_LAMINA, l.girar),
      textura(`lamina-${l.arquivo}-normal`, false, METROS_LAMINA, l.girar),
      textura(`lamina-${l.arquivo}-rug`, false, METROS_LAMINA, l.girar),
    ]).then(([cor, normal, rug]) => {
      m.map = cor;
      m.normalMap = normal;
      m.normalScale.set(0.5, 0.5);
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
    const m = new THREE.MeshPhysicalMaterial({
      name: `laca-${corId}-${brilho}`,
      color: c.hex,
      roughness: acetinado ? 0.34 : 0.66,
      clearcoat: acetinado ? 0.45 : 0,
      clearcoatRoughness: 0.28,
      sheen: acetinado ? 0 : 0.15,
      sheenRoughness: 0.8,
      sheenColor: new THREE.Color('#ffffff'),
    });
    microRelevo(0.35).then((t) => {
      m.normalMap = t;
      m.normalScale.set(acetinado ? 0.05 : 0.1, acetinado ? 0.05 : 0.1);
      m.needsUpdate = true;
      o.aoMudar();
    });
    return m;
  }

  function pedra(id: string) {
    const p = PEDRAS[id];
    const m = new THREE.MeshPhysicalMaterial({
      name: id,
      color: '#ffffff',
      roughness: p.rugosidade,
      clearcoat: p.verniz,
      clearcoatRoughness: 0.08,
    });
    textura(p.arquivo, true, p.metros).then((t) => {
      m.map = t;
      m.needsUpdate = true;
      o.aoMudar();
    });
    return m;
  }

  /** Material de um acabamento do catálogo (madeira, laca ou pedra), sempre o mesmo objeto por id. */
  function acabamento(id: string): THREE.MeshPhysicalMaterial {
    let m = cache.get(id);
    if (m) return m;
    const lacaInfo = lerLaca(id);
    if (lacaInfo) m = laca(lacaInfo.cor, lacaInfo.brilho);
    else if (PEDRAS[id]) m = pedra(id);
    else m = madeira(LAMINAS[id] ? id : 'freijo');
    cache.set(id, m);
    return m;
  }

  const metaisCache = new Map<MetalPuxador, THREE.MeshPhysicalMaterial>();
  function metal(id: MetalPuxador) {
    let m = metaisCache.get(id);
    if (m) return m;
    const hex = metais.find((x) => x.id === id)?.hex ?? '#b9bbbd';
    const config: Record<MetalPuxador, THREE.MeshPhysicalMaterialParameters> = {
      aluminio: { metalness: 1, roughness: 0.38, anisotropy: 0.6 },
      inox: { metalness: 1, roughness: 0.16 },
      preto: { metalness: 0.35, roughness: 0.5 },
      dourado: { metalness: 1, roughness: 0.3, anisotropy: 0.4 },
    };
    m = new THREE.MeshPhysicalMaterial({ name: `metal-${id}`, color: hex, ...config[id] });
    metaisCache.set(id, m);
    return m;
  }

  /* ---------- materiais fixos do ambiente (não configuráveis) ---------- */
  const fixos = {
    parede: new THREE.MeshPhysicalMaterial({ name: 'parede', color: '#ebe8e2', roughness: 0.93 }),
    teto: new THREE.MeshPhysicalMaterial({ name: 'teto', color: '#f3f1ed', roughness: 0.95 }),
    corte: new THREE.MeshStandardMaterial({ name: 'corte', color: '#2b2f3a', roughness: 0.9 }),
    piso: new THREE.MeshPhysicalMaterial({ name: 'piso', color: '#dcd7ce', roughness: 0.32, clearcoat: 0.15, clearcoatRoughness: 0.4 }),
    sombra: new THREE.MeshStandardMaterial({ name: 'sombra', color: '#141414', roughness: 0.9 }),
    interior: new THREE.MeshPhysicalMaterial({ name: 'interior', color: '#eeede9', roughness: 0.6 }),
    inox: new THREE.MeshPhysicalMaterial({ name: 'inox', color: '#cfd0d2', metalness: 1, roughness: 0.28, anisotropy: 0.5 }),
    vidroPreto: new THREE.MeshPhysicalMaterial({ name: 'vidro-preto', color: '#0a0b0d', roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03 }),
    vidro: new THREE.MeshPhysicalMaterial({
      name: 'vidro',
      color: '#dfe8ea',
      roughness: 0.02,
      metalness: 0,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    }),
    vidroPrateleira: new THREE.MeshPhysicalMaterial({ name: 'vidro-prateleira', color: '#d6e3e2', roughness: 0.05, transparent: true, opacity: 0.35 }),
    tecido: new THREE.MeshPhysicalMaterial({ name: 'tecido', color: '#c9bba8', roughness: 1, sheen: 0.6, sheenRoughness: 0.6, sheenColor: new THREE.Color('#f3e8d8') }),
    ceramica: new THREE.MeshPhysicalMaterial({ name: 'ceramica', color: '#e9e4dc', roughness: 0.42, clearcoat: 0.3 }),
    ceramicaEscura: new THREE.MeshPhysicalMaterial({ name: 'ceramica-escura', color: '#4a4540', roughness: 0.55 }),
    pretoFosco: new THREE.MeshPhysicalMaterial({ name: 'preto-fosco', color: '#1b1b1c', roughness: 0.55, metalness: 0.2 }),
    fruta: new THREE.MeshPhysicalMaterial({ name: 'fruta', color: '#e2913b', roughness: 0.45, clearcoat: 0.4 }),
    limao: new THREE.MeshPhysicalMaterial({ name: 'limao', color: '#93b04a', roughness: 0.45, clearcoat: 0.4 }),
    folha: new THREE.MeshPhysicalMaterial({ name: 'folha', color: '#55703f', roughness: 0.7, side: THREE.DoubleSide }),
    livro: new THREE.MeshPhysicalMaterial({ name: 'livro', color: '#8a7d6c', roughness: 0.8 }),
    livro2: new THREE.MeshPhysicalMaterial({ name: 'livro-2', color: '#3e4a5e', roughness: 0.8 }),
    exterior: new THREE.MeshBasicMaterial({ name: 'exterior', color: '#dfeaf2', toneMapped: false }),
    led: new THREE.MeshBasicMaterial({ name: 'led', color: '#ffd9a8', toneMapped: false }),
    luminaria: new THREE.MeshBasicMaterial({ name: 'luminaria', color: '#ffe2b8', toneMapped: false }),
    spot: new THREE.MeshBasicMaterial({ name: 'spot', color: '#fff4e2', toneMapped: false }),
    geladeira: new THREE.MeshBasicMaterial({ name: 'luz-geladeira', color: '#f4f8ff', toneMapped: false }),
  };
  fixos.parede.userData.relevo = true;
  Promise.all([textura('piso', true, 0.9), microRelevo(1.2)]).then(([piso, relevo]) => {
    fixos.piso.map = piso;
    fixos.parede.normalMap = relevo;
    fixos.parede.normalScale.set(0.25, 0.25);
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
      cache.clear();
      metaisCache.clear();
    },
  };
}

export type Materiais = ReturnType<typeof criarMateriais>;
