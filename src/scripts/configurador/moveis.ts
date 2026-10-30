import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { TipoPuxador } from './catalogo';

/*
 * Peças de marcenaria reutilizáveis por qualquer ambiente.
 * Unidades em metros. Em cada módulo, a frente olha para +z do grupo em que foi criada
 * (para frentes viradas para outro lado, crie o módulo dentro de um grupo girado).
 */

export type V3 = [number, number, number];
export type Veio = 'vertical' | 'horizontal';
/** Papéis com material trocável + materiais fixos (chave em materiais.fixos) */
export type PapelPeca = string;

export const CHAPA = 0.018; // espessura das chapas e frentes
export const FOLGA = 0.003; // folga entre frentes

/**
 * Coordenadas de textura pelo tamanho real (metros), projetadas pela face dominante.
 * Veio "vertical": corre na vertical nas faces em pé e ao longo de x nas faces deitadas.
 * Veio "horizontal": corre ao longo de x também nas faces em pé (frentes de gaveta, prateleiras).
 */
export function projetarUV(geo: THREE.BufferGeometry, veio: Veio, desloc: [number, number]) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    let u: number;
    let v: number;
    if (ay >= ax && ay >= az) {
      u = pos.getZ(i);
      v = pos.getX(i);
    } else if (ax >= az) {
      u = pos.getZ(i);
      v = pos.getY(i);
    } else if (veio === 'horizontal') {
      u = pos.getY(i);
      v = pos.getX(i);
    } else {
      u = pos.getX(i);
      v = pos.getY(i);
    }
    uv.setXY(i, u + desloc[0], v + desloc[1]);
  }
  uv.needsUpdate = true;
}

export interface Frente {
  /** dimensões da frente */
  w: number;
  h: number;
  /** onde fica o puxador */
  posicao: 'topo' | 'base' | 'centro' | 'lado';
  /** lado livre (oposto à dobradiça) em x local do nó: +1 direita, -1 esquerda, 0 centro */
  ladoLivre: -1 | 0 | 1;
  /** centro da face da frente, no espaço local do nó articulado */
  centro: THREE.Vector3;
  alta?: boolean;
}

export interface Articulacao {
  id: string;
  nome: string;
  grupo: string;
  tipo: 'porta' | 'basculante' | 'gaveta';
  no: THREE.Group;
  eixo: 'x' | 'y' | 'z';
  /** abertura máxima: radianos (portas) ou metros (gavetas) */
  limite: number;
  sinal: 1 | -1;
  base: number;
  t: number;
  alvo: 0 | 1;
  frente: Frente;
  puxadores: THREE.Mesh[];
  /** malhas clicáveis (frente + puxadores) */
  pecas: THREE.Mesh[];
}

interface OpcoesBloco {
  raio?: number;
  veio?: Veio;
  sombra?: boolean;
  pai?: THREE.Object3D;
  /** não fundir com as peças estáticas (precisa ser trocado ou escondido sozinho) */
  manter?: boolean;
}

export class Montagem {
  raiz = new THREE.Group();
  porPapel = new Map<PapelPeca, Set<THREE.Mesh>>();
  articulacoes: Articulacao[] = [];
  private geometrias = new Set<THREE.BufferGeometry>();

  constructor(private materialDe: (papel: PapelPeca) => THREE.Material) {}

  registrar(malha: THREE.Mesh, papel: PapelPeca) {
    malha.userData.papel = papel;
    malha.material = this.materialDe(papel);
    if (!this.porPapel.has(papel)) this.porPapel.set(papel, new Set());
    this.porPapel.get(papel)!.add(malha);
    this.geometrias.add(malha.geometry);
    return malha;
  }

  desregistrar(malha: THREE.Mesh) {
    this.porPapel.get(malha.userData.papel)?.delete(malha);
    malha.geometry.dispose();
    this.geometrias.delete(malha.geometry);
    malha.removeFromParent();
  }

  /** Troca o material de todas as peças de um papel. */
  aplicar(papel: PapelPeca, material: THREE.Material) {
    this.porPapel.get(papel)?.forEach((m) => (m.material = material));
  }

  caixa(w: number, h: number, d: number, raio = 0.0015, veio?: Veio) {
    const r = Math.min(raio, w / 2.05, h / 2.05, d / 2.05);
    const geo = r > 0.0006 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
    if (veio) projetarUV(geo, veio, [Math.random() * 3, Math.random() * 3]);
    return geo;
  }

  /** Bloco definido pelos cantos mínimo e máximo, como se mede em marcenaria. */
  bloco(min: V3, max: V3, papel: PapelPeca, o: OpcoesBloco = {}) {
    const w = max[0] - min[0];
    const h = max[1] - min[1];
    const d = max[2] - min[2];
    const veio = o.veio ?? (w >= h ? 'horizontal' : 'vertical');
    const malha = new THREE.Mesh(this.caixa(w, h, d, o.raio ?? 0.0015, veio));
    malha.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    malha.castShadow = o.sombra ?? true;
    malha.receiveShadow = true;
    if (o.manter) malha.userData.manter = true;
    (o.pai ?? this.raiz).add(malha);
    return this.registrar(malha, papel);
  }

  malha(geo: THREE.BufferGeometry, papel: PapelPeca, pai: THREE.Object3D = this.raiz, sombra = true) {
    const m = new THREE.Mesh(geo);
    m.castShadow = sombra;
    m.receiveShadow = true;
    pai.add(m);
    return this.registrar(m, papel);
  }

  /* ---------- caixa de móvel (lateral, base, topo, fundo e prateleiras internas) ---------- */
  caixaModulo(
    pai: THREE.Object3D,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    prof: number,
    o: { prateleiras?: number; papel?: PapelPeca; semTopo?: boolean } = {},
  ) {
    const p = o.papel ?? 'estrutura';
    const op = { pai, raio: 0.001 };
    this.bloco([x0, y0, 0], [x0 + CHAPA, y1, prof], p, { ...op, veio: 'vertical' });
    this.bloco([x1 - CHAPA, y0, 0], [x1, y1, prof], p, { ...op, veio: 'vertical' });
    this.bloco([x0 + CHAPA, y0, 0], [x1 - CHAPA, y0 + CHAPA, prof], p, op);
    if (!o.semTopo) this.bloco([x0 + CHAPA, y1 - CHAPA, 0], [x1 - CHAPA, y1, prof], p, op);
    this.bloco([x0 + CHAPA, y0 + CHAPA, 0], [x1 - CHAPA, y1 - CHAPA, 0.006], p, { ...op, sombra: false });
    const n = o.prateleiras ?? 0;
    for (let i = 1; i <= n; i++) {
      const y = y0 + ((y1 - y0) * i) / (n + 1);
      this.bloco([x0 + CHAPA, y - CHAPA / 2, 0.01], [x1 - CHAPA, y + CHAPA / 2, prof - 0.03], p, op);
    }
  }

  /* ---------- frentes articuladas ---------- */
  private registrarArticulacao(a: Omit<Articulacao, 'base' | 't' | 'alvo' | 'puxadores' | 'pecas'>, frente: THREE.Mesh) {
    const art: Articulacao = { ...a, base: a.eixo === 'z' ? a.no.position.z : a.no.rotation[a.eixo], t: 0, alvo: 0, puxadores: [], pecas: [frente] };
    frente.userData.articulacao = art;
    this.articulacoes.push(art);
    return art;
  }

  /** Porta com dobradiça lateral. A articulação fica na aresta da FACE da porta, do lado da dobradiça:
   *  ao abrir, a porta gira para fora sem invadir a caixa nem a porta vizinha. */
  porta(
    pai: THREE.Object3D,
    r: { x0: number; x1: number; y0: number; y1: number; z: number },
    o: { id: string; nome: string; grupo: string; lado: 'esq' | 'dir'; puxador?: 'topo' | 'base' | 'lado'; papel?: PapelPeca; abertura?: number; alta?: boolean },
  ) {
    const w = r.x1 - r.x0;
    const h = r.y1 - r.y0;
    const no = new THREE.Group();
    const esq = o.lado === 'esq';
    no.position.set(esq ? r.x0 : r.x1, (r.y0 + r.y1) / 2, r.z + CHAPA);
    pai.add(no);
    const frente = this.malha(this.caixa(w, h, CHAPA, 0.0015, 'vertical'), o.papel ?? 'portas', no);
    frente.position.set(esq ? w / 2 : -w / 2, 0, -CHAPA / 2);
    const margem = 0.045;
    const pos = o.puxador ?? 'topo';
    const yPux = pos === 'topo' ? h / 2 - margem - 0.08 : pos === 'base' ? -h / 2 + margem + 0.08 : 0;
    return this.registrarArticulacao(
      {
        id: o.id,
        nome: o.nome,
        grupo: o.grupo,
        tipo: 'porta',
        no,
        eixo: 'y',
        limite: THREE.MathUtils.degToRad(o.abertura ?? 90),
        sinal: esq ? -1 : 1,
        frente: {
          w,
          h,
          posicao: pos === 'lado' ? 'lado' : pos,
          ladoLivre: esq ? 1 : -1,
          centro: new THREE.Vector3(esq ? w - margem : -(w - margem), yPux, 0),
          alta: o.alta,
        },
      },
      frente,
    );
  }

  /** Porta basculante (abre para cima), articulada na aresta superior da face. */
  basculante(
    pai: THREE.Object3D,
    r: { x0: number; x1: number; y0: number; y1: number; z: number },
    o: { id: string; nome: string; grupo: string; papel?: PapelPeca },
  ) {
    const w = r.x1 - r.x0;
    const h = r.y1 - r.y0;
    const no = new THREE.Group();
    no.position.set((r.x0 + r.x1) / 2, r.y1, r.z + CHAPA);
    pai.add(no);
    const frente = this.malha(this.caixa(w, h, CHAPA, 0.0015, 'horizontal'), o.papel ?? 'portas', no);
    frente.position.set(0, -h / 2, -CHAPA / 2);
    return this.registrarArticulacao(
      {
        id: o.id,
        nome: o.nome,
        grupo: o.grupo,
        tipo: 'basculante',
        no,
        eixo: 'x',
        limite: THREE.MathUtils.degToRad(82),
        sinal: -1,
        frente: { w, h, posicao: 'base', ladoLivre: 0, centro: new THREE.Vector3(0, -h + 0.05, 0) },
      },
      frente,
    );
  }

  /** Gaveta: frente + caixa interna (laterais, fundo e traseira) que aparece ao abrir. */
  gaveta(
    pai: THREE.Object3D,
    r: { x0: number; x1: number; y0: number; y1: number; z: number },
    o: { id: string; nome: string; grupo: string; prof: number; papel?: PapelPeca; alturaCaixa?: number; puxador?: 'topo' | 'centro' },
  ) {
    const w = r.x1 - r.x0;
    const h = r.y1 - r.y0;
    const no = new THREE.Group();
    no.position.set((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, r.z);
    pai.add(no);
    const frente = this.malha(this.caixa(w, h, CHAPA, 0.0015, 'horizontal'), o.papel ?? 'gavetas', no);
    frente.position.set(0, 0, CHAPA / 2);
    // Caixa interna em chapa clara, um pouco mais estreita que a frente (corrediças).
    const hc = Math.min(o.alturaCaixa ?? h - 0.05, h - 0.03);
    const bw = w - 0.07;
    const yb = -h / 2 + 0.02;
    const t = 0.012;
    // as quatro chapas da caixa se movem juntas: uma geometria só (uma chamada de desenho por gaveta)
    const chapas: [V3, V3][] = [
      [[-bw / 2, yb, -o.prof], [-bw / 2 + t, yb + hc, 0]],
      [[bw / 2 - t, yb, -o.prof], [bw / 2, yb + hc, 0]],
      [[-bw / 2 + t, yb, -o.prof], [bw / 2 - t, yb + t, 0]],
      [[-bw / 2 + t, yb, -o.prof], [bw / 2 - t, yb + hc, -o.prof + t]],
    ];
    const partes = chapas.map(([a, b]) =>
      this.caixa(b[0] - a[0], b[1] - a[1], b[2] - a[2], 0, 'horizontal').translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2),
    );
    const caixaInterna = mergeGeometries(partes);
    partes.forEach((g) => g.dispose());
    if (caixaInterna) this.malha(caixaInterna, 'interior', no, false);
    return this.registrarArticulacao(
      {
        id: o.id,
        nome: o.nome,
        grupo: o.grupo,
        tipo: 'gaveta',
        no,
        eixo: 'z',
        limite: o.prof * 0.78,
        sinal: 1,
        frente: {
          w,
          h,
          posicao: o.puxador ?? 'topo',
          ladoLivre: 0,
          centro: new THREE.Vector3(0, (o.puxador ?? 'topo') === 'topo' ? h / 2 - 0.045 : 0, CHAPA),
        },
      },
      frente,
    );
  }

  /** Atualiza as articulações em movimento. Devolve true se alguma ainda se move. */
  animar(dt: number) {
    let movendo = false;
    for (const a of this.articulacoes) {
      if (a.t === a.alvo) continue;
      const duracao = a.tipo === 'gaveta' ? 0.55 : 0.75;
      const passo = dt / duracao;
      a.t = a.alvo > a.t ? Math.min(a.alvo, a.t + passo) : Math.max(a.alvo, a.t - passo);
      const e = a.t < 0.5 ? 4 * a.t ** 3 : 1 - (-2 * a.t + 2) ** 3 / 2; // ease in-out cúbico
      const valor = a.base + a.sinal * a.limite * e;
      if (a.eixo === 'z') a.no.position.z = valor;
      else a.no.rotation[a.eixo] = valor;
      movendo = true;
    }
    return movendo;
  }

  /* ---------- puxadores (refeitos quando o tipo muda) ---------- */
  montarPuxadores(tipo: TipoPuxador) {
    for (const a of this.articulacoes) {
      a.puxadores.forEach((m) => this.desregistrar(m));
      a.pecas = a.pecas.filter((m) => !a.puxadores.includes(m));
      a.puxadores = [];
      if (tipo === 'toque') continue;
      const f = a.frente;
      const novos: THREE.Mesh[] = [];
      const add = (geo: THREE.BufferGeometry, papel: PapelPeca, pos: THREE.Vector3, rot?: THREE.Euler) => {
        const m = this.malha(geo, papel, a.no, false);
        m.position.copy(pos);
        if (rot) m.rotation.copy(rot);
        m.userData.articulacao = a;
        novos.push(m);
      };
      // eixo do puxador: vertical em portas com dobradiça lateral, horizontal no resto
      const vertical = a.tipo === 'porta';
      if (tipo === 'perfil') {
        // Perfil de alumínio contínuo na borda (topo/base) ou ao longo da lateral livre (portas altas)
        const borda = f.posicao === 'base' ? -1 : 1;
        if (vertical && (f.alta || f.posicao === 'lado')) {
          // ao longo da aresta livre da porta (o nó fica na aresta da dobradiça; centro.x está a 4,5 cm da livre)
          const x = f.centro.x + f.ladoLivre * 0.034;
          add(this.caixa(0.022, f.h - 0.01, 0.014, 0.002), 'metal', new THREE.Vector3(x, 0, 0.007));
          add(this.caixa(0.008, f.h - 0.03, 0.01, 0), 'sombra', new THREE.Vector3(x - f.ladoLivre * 0.004, 0, 0.012));
        } else {
          const cx = a.tipo === 'porta' ? f.centro.x - f.ladoLivre * (f.w / 2 - 0.045) : 0;
          const y = a.tipo === 'gaveta' ? f.h / 2 - 0.013 : a.tipo === 'basculante' ? -f.h + 0.013 : borda * (f.h / 2 - 0.013);
          add(this.caixa(f.w - 0.004, 0.026, 0.016, 0.002), 'metal', new THREE.Vector3(cx, y, (a.tipo === 'gaveta' ? CHAPA : 0) + 0.008));
          add(this.caixa(f.w - 0.03, 0.009, 0.008, 0), 'sombra', new THREE.Vector3(cx, y - borda * 0.004, (a.tipo === 'gaveta' ? CHAPA : 0) + 0.014));
        }
      } else if (tipo === 'barra') {
        const comprimento = f.alta ? Math.min(0.6, f.h * 0.4) : Math.min(0.18, (vertical ? f.h : f.w) * 0.5);
        const barra = new THREE.CylinderGeometry(0.006, 0.006, comprimento, 18);
        const pe = new THREE.CylinderGeometry(0.0045, 0.0045, 0.03, 12);
        const z = f.centro.z + 0.03;
        const c = f.centro.clone();
        if (vertical) {
          if (f.alta) c.y = THREE.MathUtils.clamp(c.y, -f.h / 2 + comprimento / 2 + 0.05, f.h / 2 - comprimento / 2 - 0.05);
          add(barra, 'metal', new THREE.Vector3(c.x, c.y, z));
          for (const s of [-1, 1]) add(pe.clone(), 'metal', new THREE.Vector3(c.x, c.y + s * (comprimento / 2 - 0.015), z - 0.015), new THREE.Euler(Math.PI / 2, 0, 0));
          pe.dispose();
        } else {
          add(barra, 'metal', new THREE.Vector3(c.x, c.y, z), new THREE.Euler(0, 0, Math.PI / 2));
          for (const s of [-1, 1]) add(pe.clone(), 'metal', new THREE.Vector3(c.x + s * (comprimento / 2 - 0.015), c.y, z - 0.015), new THREE.Euler(Math.PI / 2, 0, 0));
          pe.dispose();
        }
      } else if (tipo === 'botao') {
        const c = f.centro.clone();
        const haste = new THREE.CylinderGeometry(0.006, 0.008, 0.022, 16);
        const cabeca = new THREE.SphereGeometry(0.015, 20, 12);
        cabeca.scale(1, 1, 0.55);
        add(haste, 'metal', new THREE.Vector3(c.x, c.y, c.z + 0.011), new THREE.Euler(Math.PI / 2, 0, 0));
        add(cabeca, 'metal', new THREE.Vector3(c.x, c.y, c.z + 0.026));
      }
      a.puxadores = novos;
      a.pecas.push(...novos);
    }
  }

  /**
   * Funde as peças estáticas de um grupo por papel (menos chamadas de desenho).
   * As trocas de acabamento continuam valendo, porque trocam o material do papel, não a geometria.
   */
  mesclar(grupo: THREE.Object3D) {
    grupo.updateMatrixWorld(true);
    const inverso = new THREE.Matrix4().copy(grupo.matrixWorld).invert();
    const lotes = new Map<string, { papel: PapelPeca; sombra: boolean; partes: THREE.BufferGeometry[] }>();
    const remover: THREE.Mesh[] = [];
    const visitar = (o: THREE.Object3D) => {
      for (const filho of o.children) {
        // nós articulados e grupos marcados ficam fora (se movem ou se escondem sozinhos)
        if (this.articulacoes.some((a) => a.no === filho) || filho.userData.manter) continue;
        const m = filho as THREE.Mesh;
        if (m.isMesh && m.userData.papel) {
          const geo = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverso, m.matrixWorld));
          const plana = geo.index ? geo.toNonIndexed() : geo;
          if (plana !== geo) geo.dispose();
          for (const nome of Object.keys(plana.attributes)) if (!['position', 'normal', 'uv'].includes(nome)) plana.deleteAttribute(nome);
          const chave = `${m.userData.papel}|${m.castShadow}`;
          if (!lotes.has(chave)) lotes.set(chave, { papel: m.userData.papel, sombra: m.castShadow, partes: [] });
          lotes.get(chave)!.partes.push(plana);
          remover.push(m);
        }
        if (!(m.isMesh && m.userData.papel)) visitar(filho);
      }
    };
    visitar(grupo);
    remover.forEach((m) => this.desregistrar(m));
    for (const { papel, sombra, partes } of lotes.values()) {
      const fundida = mergeGeometries(partes);
      partes.forEach((p) => p.dispose());
      if (!fundida) continue;
      this.malha(fundida, papel, grupo, sombra);
    }
  }

  dispose() {
    this.geometrias.forEach((g) => g.dispose());
    this.geometrias.clear();
    this.porPapel.clear();
    this.articulacoes = [];
    this.raiz.removeFromParent();
  }
}
