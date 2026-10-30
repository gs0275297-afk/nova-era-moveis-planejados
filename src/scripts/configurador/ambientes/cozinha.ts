import * as THREE from 'three';
import type { Luz } from '../catalogo';
import { CHAPA, FOLGA, Montagem, type Articulacao, type V3 } from '../moveis';
import type { LuzLinha, LuzPonto, MontarAmbiente } from './tipos';

/*
 * Cozinha planejada (simulação ilustrativa, não é um projeto executado pela Nova Era).
 * Eixos: x ao longo da parede do fundo, y para cima, z saindo da parede em direção a quem olha.
 *
 * Parede do fundo, da esquerda para a direita:
 *   torre quente (forno + micro-ondas) | gaveteiro | pia | armário | cooktop | porta-temperos | geladeira embutida
 * Em cima: armários superiores com nicho aberto (ou fechados), depurador e painel até o teto.
 * À frente: ilha com gavetas do lado da cozinha, ripado e banquetas do outro lado.
 * Em volta: sala com sanca de luz indireta, janela alta com cortina, ripado lateral e porta.
 * Medidas usuais de marcenaria: rodapé recuado de 12 cm, bancada a 90 cm, superiores 60 cm acima dela.
 */

const SALA = { L: 4.6, D: 5.6, H: 2.7, E: 0.12 };
const RODAPE = 0.12;
const BASE = { y1: 0.87, prof: 0.56 };
const TAMPO = 0.03;
const AEREO = { y0: 1.5, y1: 2.25, prof: 0.33 };
const ALTO = { y1: 2.25, prof: 0.58 };
const ILHA = { x0: 1.25, x1: 3.15, z0: 1.7, z1: 2.6 };
const JANELA = { z0: 1.35, z1: 4.55, y1: 2.38 };
const SANCA = { y: 2.5, largura: 0.42, fundo: 1.02 };

/** retângulo de frente com folga em volta */
const frente = (x0: number, x1: number, y0: number, y1: number, z: number) => ({
  x0: x0 + FOLGA / 2,
  x1: x1 - FOLGA / 2,
  y0: y0 + FOLGA / 2,
  y1: y1 - FOLGA / 2,
  z,
});

/** Sombras de contato: quadros com gradiente por vértice (escuro na junção, branco longe dela). */
class Contatos {
  private pos: number[] = [];
  private cor: number[] = [];
  private vertice(p: V3, f: number) {
    this.pos.push(...p);
    this.cor.push(f, f, f);
  }
  /** a–b é a aresta da junção; bLonge–aLonge é a aresta onde a sombra acaba. Queda em duas etapas. */
  faixa(a: V3, b: V3, bLonge: V3, aLonge: V3, f: number) {
    const meio = (u: V3, v: V3): V3 => [u[0] + (v[0] - u[0]) * 0.38, u[1] + (v[1] - u[1]) * 0.38, u[2] + (v[2] - u[2]) * 0.38];
    const aM = meio(a, aLonge);
    const bM = meio(b, bLonge);
    const fM = 1 - (1 - f) * 0.34;
    const q = (p: V3, p2: V3, r: V3, s: V3, f1: number, f2: number) => {
      this.vertice(p, f1);
      this.vertice(p2, f1);
      this.vertice(r, f2);
      this.vertice(p, f1);
      this.vertice(r, f2);
      this.vertice(s, f2);
    };
    q(a, b, bM, aM, f, fM);
    q(aM, bM, bLonge, aLonge, fM, 1);
  }
  /** Retângulo no plano horizontal: a sombra se espalha para fora, com cantos em chanfro. */
  retangulo(x0: number, z0: number, x1: number, z1: number, y: number, m: number, f: number) {
    this.faixa([x0, y, z0], [x1, y, z0], [x1 + m, y, z0 - m], [x0 - m, y, z0 - m], f);
    this.faixa([x1, y, z1], [x0, y, z1], [x0 - m, y, z1 + m], [x1 + m, y, z1 + m], f);
    this.faixa([x0, y, z1], [x0, y, z0], [x0 - m, y, z0 - m], [x0 - m, y, z1 + m], f);
    this.faixa([x1, y, z0], [x1, y, z1], [x1 + m, y, z1 + m], [x1 + m, y, z0 - m], f);
  }
  /** Disco no plano horizontal (base de banqueta, vaso): escuro no centro. */
  disco(cx: number, cz: number, y: number, r: number, f: number) {
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      this.vertice([cx, y, cz], f);
      this.vertice([cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r], 1);
      this.vertice([cx + Math.cos(a0) * r, y, cz + Math.sin(a0) * r], 1);
    }
  }
  criar(material: THREE.Material) {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.cor, 3));
    const m = new THREE.Mesh(g, material);
    m.renderOrder = 1;
    m.frustumCulled = false;
    return m;
  }
}

export const montarCozinha: MontarAmbiente = ({ materiais, leve, materialDe }) => {
  const m = new Montagem(materialDe);
  const raiz = m.raiz;
  const principal = new THREE.Group();
  const ilha = new THREE.Group();
  const nicho = new THREE.Group();
  const fechados = new THREE.Group();
  [ilha, nicho, fechados].forEach((g) => (g.userData.manter = true));
  raiz.add(principal, ilha);
  principal.add(nicho, fechados);
  const texturas: THREE.Texture[] = [];
  const geometriasAvulsas: THREE.BufferGeometry[] = [];

  const pontos: LuzPonto[] = [];
  const linhas: LuzLinha[] = [];
  const visuais: Record<Luz, THREE.Object3D[]> = { led: [], nichos: [], pendentes: [], spots: [], indireta: [] };
  const { L, D, H, E } = SALA;

  /* ---------- auxiliares ---------- */
  const rodape = (pai: THREE.Object3D, x0: number, x1: number, zFrente: number) =>
    m.bloco([x0, 0, 0.03], [x1, RODAPE, zFrente - 0.05], 'sombra', { pai, raio: 0, sombra: false });

  const torneado = (perfil: [number, number][], segmentos = 32) =>
    new THREE.LatheGeometry(
      perfil.map(([r, y]) => new THREE.Vector2(r, y)),
      segmentos,
    );

  const contatos = {
    piso: new Contatos(),
    ilha: new Contatos(),
    fundo: new Contatos(),
    esquerda: new Contatos(),
    direita: new Contatos(),
    frontal: new Contatos(),
    teto: new Contatos(),
    nicho: new Contatos(),
  };

  /* ---------- paredes, piso e teto (maquete em corte) ---------- */
  const paredes: { grupo: THREE.Group; corte?: THREE.Object3D; visivel: (c: THREE.Vector3) => boolean }[] = [];
  // Paredes "de sombra": bloqueiam o sol mesmo quando a parede visível está em corte. O material não
  // escreve nada na tela, e o motor só as mostra no quadro em que a sombra é recalculada (ver motor.ts).
  const sombras = new THREE.Group();
  sombras.userData.manter = true;
  sombras.visible = false;
  raiz.add(sombras);
  const materialSombra = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const proxy = (min: V3, max: V3) => {
    const geo = new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    geometriasAvulsas.push(geo);
    const s = new THREE.Mesh(geo, materialSombra);
    s.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    s.castShadow = true;
    sombras.add(s);
  };
  const parede = (blocos: [V3, V3][], visivel: (c: THREE.Vector3) => boolean, papel = 'parede', bloqueiaSol = true) => {
    const grupo = new THREE.Group();
    grupo.userData.manter = true;
    raiz.add(grupo);
    const corte = new THREE.Group();
    corte.userData.manter = true;
    corte.visible = false;
    raiz.add(corte);
    for (const [min, max] of blocos) {
      m.bloco(min, max, papel, { pai: grupo, raio: 0, sombra: false, veio: 'vertical' });
      // tampa escura no topo: a parede aparece "cortada", como numa planta
      if (max[1] >= H - 0.001 && papel === 'parede') m.bloco([min[0], max[1], min[2]], [max[0], max[1] + 0.004, max[2]], 'corte', { pai: grupo, raio: 0, sombra: false });
      if (min[1] <= 0.001) m.bloco([min[0], 0, min[2]], [max[0], 0.05, max[2]], 'corte', { pai: corte, raio: 0, sombra: false });
      if (bloqueiaSol) proxy(min, max);
    }
    paredes.push({ grupo, corte, visivel });
    return grupo;
  };
  // o sol vem da frente e da esquerda: fundo e direita nunca bloqueiam a luz, nem entram na conta da sombra
  parede([[[-E, 0, -E], [L + E, H, 0]]], (c) => c.z > 0.02, 'parede', false);
  const esquerda = parede(
    [
      [[-E, 0, 0], [0, H, JANELA.z0]],
      [[-E, 0, JANELA.z1], [0, H, D]],
      [[-E, JANELA.y1, JANELA.z0], [0, H, JANELA.z1]],
    ],
    (c) => c.x > 0.02,
  );
  const direita = parede([[[L, 0, 0], [L + E, H, D]]], (c) => c.x < L - 0.02, 'parede', false);
  const frontal = parede([[[-E, 0, D], [L + E, H, D + E]]], (c) => c.z < D - 0.02);
  // o teto só some com a câmera acima dele (vista de cima, a maquete fica aberta)
  const teto = parede([[[-E, H, -E], [L + E, H + 0.06, D + E]]], (c) => c.y < SANCA.y - 0.02, 'teto');
  m.bloco([-E, -0.03, -E], [L + E, 0, D + E], 'piso', { raio: 0, sombra: false, pai: principal, veio: 'horizontal' });

  // sanca de gesso em volta do forro, com fita de LED escondida (luz indireta)
  const faixaTeto = (min: V3, max: V3) => m.bloco(min, max, 'teto', { pai: teto, raio: 0, sombra: false });
  faixaTeto([0, SANCA.y, 0], [L, H, SANCA.fundo]);
  faixaTeto([0, SANCA.y, D - SANCA.largura], [L, H, D]);
  faixaTeto([0, SANCA.y, SANCA.fundo], [SANCA.largura, H, D - SANCA.largura]);
  faixaTeto([L - SANCA.largura, SANCA.y, SANCA.fundo], [L, H, D - SANCA.largura]);
  {
    // halo no forro: gradiente aditivo por vértice, do rasgo da sanca para o centro
    const x0 = SANCA.largura;
    const x1 = L - SANCA.largura;
    const z0 = SANCA.fundo;
    const z1 = D - SANCA.largura;
    const pos: number[] = [];
    const cor: number[] = [];
    const quad = (a: V3, b: V3, c: V3, d: V3, fa: number, fb: number) => {
      for (const [p, f] of [[a, fa], [b, fa], [c, fb], [a, fa], [c, fb], [d, fb]] as [V3, number][]) {
        pos.push(...p);
        cor.push(f, f, f);
      }
    };
    const y = H - 0.002;
    const n = 0.95;
    quad([x0, y, z0], [x1, y, z0], [x1 - n, y, z0 + n], [x0 + n, y, z0 + n], 1, 0);
    quad([x1, y, z1], [x0, y, z1], [x0 + n, y, z1 - n], [x1 - n, y, z1 - n], 1, 0);
    quad([x0, y, z1], [x0, y, z0], [x0 + n, y, z0 + n], [x0 + n, y, z1 - n], 1, 0);
    quad([x1, y, z0], [x1, y, z1], [x1 - n, y, z1 - n], [x1 - n, y, z0 + n], 1, 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
    geometriasAvulsas.push(g);
    const halo = new THREE.Mesh(g, materiais.fixos.indireta);
    halo.renderOrder = 2;
    teto.add(halo);
    visuais.indireta.push(halo);
  }
  // sombra suave onde a sanca encontra as paredes
  const yS = SANCA.y - 0.001;
  contatos.teto.faixa([0, yS, D], [L, yS, D], [L, yS, D - 0.3], [0, yS, D - 0.3], 0.82);
  contatos.teto.faixa([0, yS, 0.6], [0, yS, D], [0.3, yS, D], [0.3, yS, 0.6], 0.82);
  contatos.teto.faixa([L, yS, D], [L, yS, 0.6], [L - 0.3, yS, 0.6], [L - 0.3, yS, D], 0.82);

  // paredes: junções com o piso e com a sanca
  const xD = L - 0.001;
  const zF = D - 0.001;
  contatos.direita.faixa([xD, 0, D], [xD, 0, 3.2], [xD, 0.26, 3.2], [xD, 0.26, D], 0.8);
  contatos.direita.faixa([xD, SANCA.y, 3.2], [xD, SANCA.y, D], [xD, SANCA.y - 0.38, D], [xD, SANCA.y - 0.38, 3.2], 0.8);
  contatos.frontal.faixa([0, 0, zF], [L, 0, zF], [L, 0.26, zF], [0, 0.26, zF], 0.8);
  contatos.frontal.faixa([0, SANCA.y, zF], [L, SANCA.y, zF], [L, SANCA.y - 0.38, zF], [0, SANCA.y - 0.38, zF], 0.8);
  contatos.frontal.faixa([0, 0, zF], [0, SANCA.y, zF], [0.34, SANCA.y, zF], [0.34, 0, zF], 0.82);
  contatos.frontal.faixa([L, SANCA.y, zF], [L, 0, zF], [L - 0.34, 0, zF], [L - 0.34, SANCA.y, zF], 0.82);
  contatos.esquerda.faixa([0.001, 0, D], [0.001, 0, JANELA.z1], [0.001, 0.26, JANELA.z1], [0.001, 0.26, D], 0.8);
  contatos.esquerda.faixa([0.001, 0, 0.6], [0.001, 0, JANELA.z0], [0.001, 0.26, JANELA.z0], [0.001, 0.26, 0.6], 0.8);
  // piso: junto às paredes e à frente dos armários
  const yp = 0.0015;
  contatos.piso.faixa([0, yp, 0.53], [L, yp, 0.53], [L, yp, 1.12], [0, yp, 1.12], 0.58);
  contatos.piso.faixa([L, yp, D], [L, yp, 0.53], [L - 0.42, yp, 0.53], [L - 0.42, yp, D], 0.76);
  contatos.piso.faixa([0, yp, D], [L, yp, D], [L, yp, D - 0.42], [0, yp, D - 0.42], 0.76);
  contatos.piso.faixa([0, yp, 0.53], [0, yp, JANELA.z0], [0.3, yp, JANELA.z0], [0.3, yp, 0.53], 0.78);
  contatos.piso.faixa([0, yp, JANELA.z1], [0, yp, D], [0.3, yp, D], [0.3, yp, JANELA.z1], 0.78);

  // rodapé de parede
  const rodapeParede = (min: V3, max: V3, pai: THREE.Object3D) => m.bloco(min, max, 'rodapeParede', { pai, raio: 0.002, sombra: false });
  rodapeParede([0, 0, ALTO.prof + CHAPA], [0.012, 0.08, JANELA.z0], esquerda);
  rodapeParede([0, 0, JANELA.z1], [0.012, 0.08, D], esquerda);
  rodapeParede([0, 0, D - 0.012], [L, 0.08, D], frontal);

  /* ---------- janela alta: caixilho, vidro, trilho, paisagem e cortina ---------- */
  const caixilho = (min: V3, max: V3) => m.bloco(min, max, 'caixilho', { pai: esquerda, raio: 0.002, sombra: false });
  const J = JANELA;
  const folhas = 4;
  caixilho([-0.09, J.y1 - 0.05, J.z0], [-0.02, J.y1, J.z1]);
  caixilho([-0.1, 0, J.z0], [-0.01, 0.028, J.z1]); // trilho no piso
  for (let i = 0; i <= folhas; i++) {
    const z = J.z0 + ((J.z1 - J.z0) * i) / folhas;
    caixilho([-0.085, 0.02, Math.max(J.z0, z - 0.022)], [-0.025, J.y1, Math.min(J.z1, z + 0.022)]);
  }
  for (let i = 0; i < folhas; i++) {
    const z = J.z0 + ((J.z1 - J.z0) * (i + 0.5)) / folhas;
    const meia = (J.z1 - J.z0) / folhas / 2 - 0.022;
    m.bloco([-0.06, 0.03, z - meia], [-0.05, J.y1 - 0.05, z + meia], 'vidro', { pai: esquerda, raio: 0, sombra: false });
  }
  // paisagem (céu e vegetação) num plano colado à face externa da parede: nunca aparece por cima dela
  const geoCeu = new THREE.PlaneGeometry(J.z1 - J.z0 + 0.1, J.y1 + 0.1);
  geometriasAvulsas.push(geoCeu);
  const telaCeu = document.createElement('canvas');
  telaCeu.width = 512;
  telaCeu.height = 256;
  const c2 = telaCeu.getContext('2d')!;
  const grade = c2.createLinearGradient(0, 0, 0, 256);
  grade.addColorStop(0, '#bcd6ee');
  grade.addColorStop(0.55, '#ffffff');
  c2.fillStyle = grade;
  c2.fillRect(0, 0, 512, 256);
  c2.filter = 'blur(5px)';
  let acaso = 11;
  const aleatorio = () => (acaso = (acaso * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 90; i++) {
    const v = 90 + aleatorio() * 60;
    c2.fillStyle = `rgb(${v * 0.9 + 55}, ${v + 62}, ${v * 0.82 + 50})`;
    c2.beginPath();
    c2.arc(aleatorio() * 512, 150 + aleatorio() * 60, 16 + aleatorio() * 26, 0, Math.PI * 2);
    c2.fill();
  }
  c2.filter = 'none';
  c2.fillStyle = '#b5bfa6';
  c2.fillRect(0, 206, 512, 50);
  const texCeu = new THREE.CanvasTexture(telaCeu);
  texCeu.colorSpace = THREE.SRGBColorSpace;
  texturas.push(texCeu);
  materiais.fixos.exterior.map = texCeu;
  materiais.fixos.exterior.needsUpdate = true;
  const ceu = new THREE.Mesh(geoCeu, materiais.fixos.exterior);
  ceu.position.set(-E - 0.002, (J.y1 + 0.1) / 2, (J.z0 + J.z1) / 2);
  ceu.rotation.y = Math.PI / 2;
  esquerda.add(ceu);
  // cortina de voal: plano ondulado translúcido, recolhido nos dois lados
  const cortina = (z0: number, z1: number) => {
    const g = new THREE.PlaneGeometry(1, 1, Math.round((z1 - z0) * 90), 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) + 0.5;
      const v = p.getY(i) + 0.5;
      const z = z0 + (z1 - z0) * u;
      const dobra = Math.sin(z * 34) * 0.03 + Math.sin(z * 83 + 1) * 0.012;
      p.setXYZ(i, 0.1 + dobra, v * (SANCA.y - 0.03), z);
    }
    g.computeVertexNormals();
    m.malha(g, 'cortina', esquerda, false);
  };
  cortina(J.z0 - 0.02, J.z0 + 0.55);
  cortina(J.z1 - 0.48, J.z1 + 0.02);

  /* ---------- parede direita: ripado de piso a sanca e porta de passagem ---------- */
  const Rip = { z0: ALTO.prof + CHAPA, z1: 3.2, y1: SANCA.y };
  m.bloco([L - 0.012, 0, Rip.z0], [L, Rip.y1, Rip.z1], 'sombra', { pai: direita, raio: 0, sombra: false });
  for (let z = Rip.z0 + 0.006; z + 0.04 <= Rip.z1; z += 0.056) {
    m.bloco([L - 0.042, 0.002, z], [L - 0.012, Rip.y1 - 0.002, z + 0.04], 'paineis', { pai: direita, raio: 0, sombra: true, veio: 'vertical' });
  }
  rodapeParede([L - 0.012, 0, Rip.z1], [L, 0.08, 3.72], direita);
  rodapeParede([L - 0.012, 0, 4.72], [L, 0.08, D], direita);
  const Pt = { z0: 3.8, z1: 4.64, y1: 2.12 };
  const batente = (min: V3, max: V3) => m.bloco(min, max, 'rodapeParede', { pai: direita, raio: 0.002, sombra: false });
  batente([L - 0.018, 0, Pt.z0 - 0.07], [L, Pt.y1 + 0.07, Pt.z0]);
  batente([L - 0.018, 0, Pt.z1], [L, Pt.y1 + 0.07, Pt.z1 + 0.07]);
  batente([L - 0.018, Pt.y1, Pt.z0], [L, Pt.y1 + 0.07, Pt.z1]);
  m.bloco([L - 0.03, 0.004, Pt.z0 + 0.002], [L, Pt.y1 - 0.002, Pt.z1 - 0.002], 'decoMadeira', { pai: direita, raio: 0.002, sombra: false, veio: 'vertical' });
  m.bloco([L - 0.05, 1.03, Pt.z0 + 0.06], [L - 0.03, 1.05, Pt.z0 + 0.18], 'pretoFosco', { pai: direita, raio: 0.003, sombra: false });
  m.bloco([L - 0.012, 1.15, 3.42], [L, 1.27, 3.5], 'tomada', { pai: direita, raio: 0.003, sombra: false }); // interruptor

  /* ---------- torre quente (forno e micro-ondas), x 0,03–0,65 ---------- */
  const T = { x0: 0.03, x1: 0.65 };
  m.bloco([0, 0, 0], [T.x0, H, ALTO.prof + CHAPA], 'paineis', { pai: principal, veio: 'vertical' });
  m.caixaModulo(principal, T.x0, T.x1, RODAPE, ALTO.y1, ALTO.prof);
  [0.72, 1.38, 1.8].forEach((y) => m.bloco([T.x0 + CHAPA, y - CHAPA, 0.01], [T.x1 - CHAPA, y, ALTO.prof], 'estrutura', { pai: principal, raio: 0.001 }));
  rodape(principal, T.x0, T.x1, ALTO.prof);
  m.gaveta(principal, frente(T.x0, T.x1, RODAPE, 0.42, ALTO.prof), { id: 'torre-g1', nome: 'Gaveta inferior da torre', grupo: 'Torre quente', prof: 0.5 });
  m.gaveta(principal, frente(T.x0, T.x1, 0.42, 0.72, ALTO.prof), { id: 'torre-g2', nome: 'Gaveta da torre', grupo: 'Torre quente', prof: 0.5 });
  const xT = (T.x0 + T.x1) / 2;
  const barraEletro = (y: number) => {
    const b = m.malha(new THREE.CylinderGeometry(0.009, 0.009, T.x1 - T.x0 - 0.14, 18), 'inox', principal);
    b.rotation.z = Math.PI / 2;
    b.position.set(xT, y, ALTO.prof + 0.055);
    for (const s of [-1, 1]) {
      const pe = m.malha(new THREE.CylinderGeometry(0.005, 0.005, 0.035, 10), 'inox', principal);
      pe.rotation.x = Math.PI / 2;
      pe.position.set(xT + s * ((T.x1 - T.x0) / 2 - 0.1), y, ALTO.prof + 0.038);
    }
  };
  // forno: moldura de inox, faixa de comando com dois botões e visor, porta de vidro escuro
  {
    const y0 = 0.725;
    const y1 = 1.375;
    m.bloco([T.x0 + 0.004, y0, ALTO.prof], [T.x1 - 0.004, y1, ALTO.prof + 0.02], 'inox', { pai: principal, raio: 0.003 });
    m.bloco([T.x0 + 0.02, y0 + 0.02, ALTO.prof + 0.02], [T.x1 - 0.02, y1 - 0.13, ALTO.prof + 0.027], 'vidroPreto', { pai: principal, raio: 0.003 });
    m.bloco([xT - 0.075, y1 - 0.082, ALTO.prof + 0.02], [xT + 0.075, y1 - 0.042, ALTO.prof + 0.0225], 'vidroPreto', { pai: principal, raio: 0, sombra: false });
    for (const s of [-1, 1]) {
      const b = m.malha(new THREE.CylinderGeometry(0.017, 0.019, 0.022, 24), 'inox', principal);
      b.rotation.x = Math.PI / 2;
      b.position.set(xT + s * 0.2, y1 - 0.062, ALTO.prof + 0.03);
    }
    barraEletro(y1 - 0.155);
  }
  // micro-ondas: porta com grade escura e coluna de comando
  {
    const y0 = 1.385;
    const y1 = 1.795;
    m.bloco([T.x0 + 0.004, y0, ALTO.prof], [T.x1 - 0.004, y1, ALTO.prof + 0.02], 'inox', { pai: principal, raio: 0.003 });
    m.bloco([T.x0 + 0.02, y0 + 0.02, ALTO.prof + 0.02], [T.x1 - 0.13, y1 - 0.02, ALTO.prof + 0.027], 'vidroPreto', { pai: principal, raio: 0.003 });
    m.bloco([T.x1 - 0.115, y0 + 0.02, ALTO.prof + 0.02], [T.x1 - 0.02, y1 - 0.02, ALTO.prof + 0.025], 'vidroPreto', { pai: principal, raio: 0.002 });
  }
  m.basculante(principal, frente(T.x0, T.x1, 1.8, ALTO.y1, ALTO.prof), { id: 'torre-b', nome: 'Porta superior da torre', grupo: 'Torre quente' });

  /* ---------- armários de baixo, x 0,65–3,85 ---------- */
  const zb = BASE.prof;
  const caixaBase = (x0: number, x1: number, o: { prateleiras?: number; semTopo?: boolean } = {}) => {
    m.caixaModulo(principal, x0, x1, RODAPE, BASE.y1, BASE.prof, o);
    rodape(principal, x0, x1, BASE.prof);
  };
  // gaveteiro
  caixaBase(0.65, 1.25);
  const gavetas = (x0: number, x1: number, cortes: number[], prefixo: string, grupo: string, nomes: string[]) => {
    for (let i = 0; i < cortes.length - 1; i++) {
      m.gaveta(principal, frente(x0, x1, cortes[i], cortes[i + 1], zb), {
        id: `${prefixo}-${i + 1}`,
        nome: nomes[i],
        grupo,
        prof: 0.5,
        organizador: i === cortes.length - 2,
      });
    }
  };
  gavetas(0.65, 1.25, [RODAPE, 0.41, 0.69, BASE.y1], 'gaveteiro', 'Gaveteiro', ['Gaveta de baixo', 'Gaveta do meio', 'Gaveta de cima']);
  // pia: sem tampo (a cuba entra), duas portas
  caixaBase(1.25, 2.15, { semTopo: true });
  m.porta(principal, frente(1.25, 1.7, RODAPE, BASE.y1, zb), { id: 'pia-e', nome: 'Porta esquerda da pia', grupo: 'Pia', lado: 'esq' });
  m.porta(principal, frente(1.7, 2.15, RODAPE, BASE.y1, zb), { id: 'pia-d', nome: 'Porta direita da pia', grupo: 'Pia', lado: 'dir' });
  // armário de uma porta
  caixaBase(2.15, 2.65, { prateleiras: 1 });
  m.porta(principal, frente(2.15, 2.65, RODAPE, BASE.y1, zb), { id: 'base-p', nome: 'Porta do armário', grupo: 'Armários de baixo', lado: 'esq' });
  // gavetões do cooktop
  caixaBase(2.65, 3.55);
  gavetas(2.65, 3.55, [RODAPE, 0.41, 0.69, BASE.y1], 'cooktop', 'Gavetões do cooktop', ['Gavetão de baixo', 'Gavetão do meio', 'Gaveta de talheres']);
  // porta-temperos: frente inteira que corre como gaveta
  caixaBase(3.55, 3.85);
  m.gaveta(principal, frente(3.55, 3.85, RODAPE, BASE.y1, zb), { id: 'temperos', nome: 'Porta-temperos', grupo: 'Armários de baixo', prof: 0.5, alturaCaixa: 0.68, puxador: 'topo' });

  /* ---------- geladeira embutida, x 3,85–4,55 ---------- */
  const G = { x0: 3.85, x1: 4.55 };
  m.caixaModulo(principal, G.x0, G.x1, RODAPE, ALTO.y1, ALTO.prof);
  m.bloco([G.x0 + CHAPA, 1.86, 0.01], [G.x1 - CHAPA, 1.86 + CHAPA, ALTO.prof], 'estrutura', { pai: principal, raio: 0.001 });
  rodape(principal, G.x0, G.x1, ALTO.prof);
  m.bloco([G.x1, 0, 0], [L, H, ALTO.prof + CHAPA], 'paineis', { pai: principal, veio: 'vertical' });
  // interior do refrigerador (aparece ao abrir): caixa clara, prateleiras de vidro e luz
  const gi = { x0: G.x0 + CHAPA + 0.02, x1: G.x1 - CHAPA - 0.02, y0: RODAPE + 0.03, y1: 1.83 };
  m.bloco([gi.x0, gi.y0, 0.05], [gi.x1, gi.y1, 0.06], 'interior', { pai: principal, raio: 0 });
  m.bloco([gi.x0, gi.y0, 0.06], [gi.x0 + 0.01, gi.y1, ALTO.prof - 0.01], 'interior', { pai: principal, raio: 0 });
  m.bloco([gi.x1 - 0.01, gi.y0, 0.06], [gi.x1, gi.y1, ALTO.prof - 0.01], 'interior', { pai: principal, raio: 0 });
  [0.55, 0.95, 1.3].forEach((y) => m.bloco([gi.x0 + 0.01, y, 0.07], [gi.x1 - 0.01, y + 0.006, ALTO.prof - 0.04], 'vidroPrateleira', { pai: principal, raio: 0, sombra: false }));
  m.bloco([gi.x0 + 0.1, gi.y1 - 0.02, 0.2], [gi.x1 - 0.1, gi.y1 - 0.01, 0.35], 'geladeira', { pai: principal, raio: 0, sombra: false });
  m.porta(principal, frente(G.x0, G.x1, RODAPE, 1.86, ALTO.prof), {
    id: 'geladeira',
    nome: 'Porta da geladeira',
    grupo: 'Geladeira embutida',
    lado: 'dir',
    puxador: 'lado',
    alta: true,
  });
  m.basculante(principal, frente(G.x0, G.x1, 1.86, ALTO.y1, ALTO.prof), { id: 'geladeira-b', nome: 'Porta sobre a geladeira', grupo: 'Geladeira embutida' });

  /* ---------- bancada, painel de pedra, cuba, torneira e cooktop ---------- */
  const yT = BASE.y1;
  const yTopo = yT + TAMPO;
  const pedra = (min: V3, max: V3, pai: THREE.Object3D = principal, manter = false) => m.bloco(min, max, 'bancada', { pai, raio: 0.0025, veio: 'horizontal', manter, continuo: true });
  const CUBA = { x0: 1.43, x1: 1.97, z0: 0.1, z1: 0.48, fundo: 0.68 };
  pedra([0.65, yT, 0], [CUBA.x0, yTopo, 0.62]);
  pedra([CUBA.x1, yT, 0], [3.85, yTopo, 0.62]);
  pedra([CUBA.x0, yT, 0], [CUBA.x1, yTopo, CUBA.z0]);
  pedra([CUBA.x0, yT, CUBA.z1], [CUBA.x1, yTopo, 0.62]);
  // painel de pedra na parede, da bancada até os armários (a fita de LED revela os veios)
  m.bloco([0.65, yTopo, 0], [3.85, AEREO.y0, 0.012], 'bancada', { pai: principal, raio: 0.001, veio: 'horizontal', continuo: true });
  // "saia": borda frontal que deixa a bancada encorpada (opção de espessura aparente)
  const saias: THREE.Mesh[] = [pedra([0.65, yT - 0.04, 0.6], [3.85, yT, 0.62], principal, true)];
  // sombras de contato: pedra com a parede
  contatos.fundo.faixa([0.65, yTopo + 0.0005, 0.0125], [3.85, yTopo + 0.0005, 0.0125], [3.85, yTopo + 0.0005, 0.12], [0.65, yTopo + 0.0005, 0.12], 0.8);
  contatos.fundo.faixa([0.65, yTopo, 0.0128], [3.85, yTopo, 0.0128], [3.85, yTopo + 0.09, 0.0128], [0.65, yTopo + 0.09, 0.0128], 0.82);
  // cuba de inox, com fundo, paredes e ralo
  const cuba: [V3, V3][] = [
    [[CUBA.x0, CUBA.fundo, CUBA.z0], [CUBA.x1, CUBA.fundo + 0.004, CUBA.z1]],
    [[CUBA.x0, CUBA.fundo, CUBA.z0], [CUBA.x0 + 0.004, yTopo - 0.002, CUBA.z1]],
    [[CUBA.x1 - 0.004, CUBA.fundo, CUBA.z0], [CUBA.x1, yTopo - 0.002, CUBA.z1]],
    [[CUBA.x0, CUBA.fundo, CUBA.z0], [CUBA.x1, yTopo - 0.002, CUBA.z0 + 0.004]],
    [[CUBA.x0, CUBA.fundo, CUBA.z1 - 0.004], [CUBA.x1, yTopo - 0.002, CUBA.z1]],
  ];
  cuba.forEach(([a, b]) => m.bloco(a, b, 'inox', { pai: principal, raio: 0 }));
  const cx = (CUBA.x0 + CUBA.x1) / 2;
  const cz = (CUBA.z0 + CUBA.z1) / 2;
  const ralo = m.malha(new THREE.CylinderGeometry(0.04, 0.04, 0.003, 28), 'ferragem', principal, false);
  ralo.position.set(cx, CUBA.fundo + 0.005, cz);
  const raloInterno = m.malha(new THREE.CylinderGeometry(0.022, 0.022, 0.003, 20), 'sombra', principal, false);
  raloInterno.position.set(cx, CUBA.fundo + 0.0065, cz);
  // torneira gourmet: segue o metal escolhido para os puxadores
  const baseTorneira = m.malha(torneado([[0, 0], [0.028, 0], [0.028, 0.006], [0.018, 0.012], [0.016, 0.3], [0, 0.3]]), 'metal', principal);
  baseTorneira.position.set(cx, yTopo, 0.055);
  const bico = new THREE.CatmullRomCurve3([
    new THREE.Vector3(cx, yTopo + 0.29, 0.055),
    new THREE.Vector3(cx, yTopo + 0.41, 0.085),
    new THREE.Vector3(cx, yTopo + 0.39, 0.2),
    new THREE.Vector3(cx, yTopo + 0.29, 0.25),
  ]);
  m.malha(new THREE.TubeGeometry(bico, 36, 0.0105, 14, false), 'metal', principal);
  const ponta = m.malha(new THREE.CylinderGeometry(0.0125, 0.0125, 0.03, 16), 'metal', principal);
  ponta.position.set(cx, yTopo + 0.275, 0.2515);
  const alavanca = m.malha(m.caixa(0.012, 0.012, 0.08, 0.004), 'metal', principal);
  alavanca.position.set(cx + 0.03, yTopo + 0.22, 0.065);
  alavanca.rotation.x = -0.3;
  // dosador de detergente embutido
  const dosador = m.malha(torneado([[0, 0], [0.016, 0], [0.016, 0.05], [0.006, 0.07], [0.006, 0.1], [0, 0.1]], 20), 'metal', principal);
  dosador.position.set(cx + 0.14, yTopo, 0.055);
  // cooktop de indução: vidro, moldura fina, marcações das zonas e faixa de toque
  const xc = 3.1;
  m.bloco([xc - 0.295, yTopo, 0.055], [xc + 0.295, yTopo + 0.004, 0.565], 'aluminioPerfil', { pai: principal, raio: 0.001 });
  m.bloco([xc - 0.29, yTopo + 0.001, 0.06], [xc + 0.29, yTopo + 0.006, 0.56], 'vidroPreto', { pai: principal, raio: 0.002 });
  for (const [dx, dz, r] of [[-0.14, 0.18, 0.09], [0.14, 0.18, 0.07], [-0.14, 0.42, 0.07], [0.14, 0.42, 0.095]] as const) {
    const anel = m.malha(new THREE.RingGeometry(r - 0.0022, r, 56), 'ferragem', principal, false);
    anel.rotation.x = -Math.PI / 2;
    anel.position.set(xc + dx, yTopo + 0.0065, dz);
  }
  m.bloco([xc - 0.1, yTopo + 0.006, 0.525], [xc + 0.1, yTopo + 0.0064, 0.545], 'ferragem', { pai: principal, raio: 0, sombra: false });
  // tomadas no painel de pedra
  for (const x of [1.02, 3.68]) {
    m.bloco([x - 0.04, 1.08, 0.012], [x + 0.04, 1.2, 0.02], 'tomada', { pai: principal, raio: 0.003, sombra: false });
    for (const y of [1.115, 1.165]) {
      const o = m.malha(new THREE.CylinderGeometry(0.0155, 0.0155, 0.002, 20), 'interior', principal, false);
      o.rotation.x = Math.PI / 2;
      o.position.set(x, y, 0.0203);
      // os três furos do padrão brasileiro
      for (const [dx, dy] of [[-0.0058, -0.003], [0.0058, -0.003], [0, 0.0058]]) {
        const furo = m.malha(new THREE.CylinderGeometry(0.0019, 0.0019, 0.001, 8), 'sombra', principal, false);
        furo.rotation.x = Math.PI / 2;
        furo.position.set(x + dx, y + dy, 0.0216);
      }
    }
  }

  /* ---------- armários superiores, y 1,50–2,25 ---------- */
  const za = AEREO.prof;
  const caixaAerea = (x0: number, x1: number, y0 = AEREO.y0, pai: THREE.Object3D = principal, papel = 'estrutura', prateleiras = 1) =>
    m.caixaModulo(pai, x0, x1, y0, AEREO.y1, AEREO.prof, { prateleiras, papel });
  caixaAerea(0.65, 1.25);
  m.porta(principal, frente(0.65, 1.25, AEREO.y0, AEREO.y1, za), { id: 'aereo-1', nome: 'Porta superior esquerda', grupo: 'Armários superiores', lado: 'dir', puxador: 'base', papel: 'aereos' });
  // variante A: nicho aberto iluminado (papel "prateleiras"); variante B: duas portas
  caixaAerea(1.25, 2.15, AEREO.y0, nicho, 'prateleiras', 1);
  caixaAerea(1.25, 2.15, AEREO.y0, fechados, 'estrutura', 1);
  m.porta(fechados, frente(1.25, 1.7, AEREO.y0, AEREO.y1, za), { id: 'aereo-2e', nome: 'Porta superior do meio (esquerda)', grupo: 'Armários superiores', lado: 'esq', puxador: 'base', papel: 'aereos' });
  m.porta(fechados, frente(1.7, 2.15, AEREO.y0, AEREO.y1, za), { id: 'aereo-2d', nome: 'Porta superior do meio (direita)', grupo: 'Armários superiores', lado: 'dir', puxador: 'base', papel: 'aereos' });
  caixaAerea(2.15, 2.65);
  m.porta(principal, frente(2.15, 2.65, AEREO.y0, AEREO.y1, za), { id: 'aereo-3', nome: 'Porta superior', grupo: 'Armários superiores', lado: 'esq', puxador: 'base', papel: 'aereos' });
  // sobre o cooktop: depurador embutido (com filtros) + basculante
  caixaAerea(2.65, 3.55, 1.6, principal, 'estrutura', 0);
  m.bloco([2.66, AEREO.y0, 0.02], [3.54, 1.6, AEREO.prof + CHAPA], 'inox', { pai: principal, raio: 0.003 });
  m.bloco([2.75, AEREO.y0 - 0.002, 0.06], [3.45, AEREO.y0, 0.3], 'sombra', { pai: principal, raio: 0, sombra: false });
  for (let i = 0; i < 9; i++) {
    const x = 2.78 + i * 0.08;
    m.bloco([x, AEREO.y0 - 0.0035, 0.07], [x + 0.05, AEREO.y0 - 0.002, 0.29], 'aluminioPerfil', { pai: principal, raio: 0, sombra: false });
  }
  m.basculante(principal, frente(2.65, 3.55, 1.6, AEREO.y1, za), { id: 'aereo-4', nome: 'Basculante sobre o cooktop', grupo: 'Armários superiores', papel: 'aereos' });
  caixaAerea(3.55, 3.85);
  m.porta(principal, frente(3.55, 3.85, AEREO.y0, AEREO.y1, za), { id: 'aereo-5', nome: 'Porta superior estreita', grupo: 'Armários superiores', lado: 'esq', puxador: 'base', papel: 'aereos' });
  // painel até a sanca, na profundidade de cada trecho
  m.bloco([T.x0, ALTO.y1, 0], [T.x1, H, ALTO.prof + CHAPA], 'paineis', { pai: principal });
  m.bloco([T.x1, AEREO.y1, 0], [G.x0, H, AEREO.prof + CHAPA], 'paineis', { pai: principal });
  m.bloco([G.x0, ALTO.y1, 0], [G.x1, H, ALTO.prof + CHAPA], 'paineis', { pai: principal });

  // LED sob os superiores: perfil de alumínio, difusor que brilha e a luz na pedra e na bancada
  m.bloco([0.68, AEREO.y0 - 0.008, 0.25], [2.64, AEREO.y0, 0.285], 'aluminioPerfil', { pai: principal, raio: 0, sombra: false });
  m.bloco([3.56, AEREO.y0 - 0.008, 0.25], [3.84, AEREO.y0, 0.285], 'aluminioPerfil', { pai: principal, raio: 0, sombra: false });
  const fita = (x0: number, x1: number) => {
    const f = m.bloco([x0, AEREO.y0 - 0.0095, 0.258], [x1, AEREO.y0 - 0.008, 0.277], 'led', { pai: raiz, raio: 0, sombra: false, manter: true });
    visuais.led.push(f);
  };
  fita(0.69, 2.63);
  fita(3.57, 3.83);
  linhas.push({ grupo: 'led', a: [0.72, AEREO.y0 - 0.02, 0.25], b: [3.8, AEREO.y0 - 0.02, 0.25], dir: [0, -1, 0.05], alcance: 1.0, intensidade: 1.15 });

  // nicho aberto: prateleira com suportes, objetos e LED sob o topo e sob a prateleira
  const nx = { x0: 1.25 + CHAPA, x1: 2.15 - CHAPA };
  const yPrat = AEREO.y0 + (AEREO.y1 - AEREO.y0) / 2;
  for (const y of [AEREO.y1 - CHAPA, yPrat - CHAPA / 2]) {
    m.bloco([nx.x0 + 0.015, y - 0.007, 0.235], [nx.x1 - 0.015, y, 0.262], 'aluminioPerfil', { pai: nicho, raio: 0, sombra: false });
    const f = m.bloco([nx.x0 + 0.02, y - 0.0085, 0.24], [nx.x1 - 0.02, y - 0.007, 0.257], 'led', { pai: nicho, raio: 0, sombra: false, manter: true });
    visuais.nichos.push(f);
    linhas.push({ grupo: 'nichos', a: [nx.x0 + 0.05, y - 0.02, 0.24], b: [nx.x1 - 0.05, y - 0.02, 0.24], dir: [0, -1, -0.15], alcance: 0.48, intensidade: 0.42 });
  }
  // cantos do nicho escurecem (oclusão pintada)
  const zf = 0.0065;
  for (const [ya, yb] of [[AEREO.y0 + CHAPA, yPrat - CHAPA / 2], [yPrat + CHAPA / 2, AEREO.y1 - CHAPA]]) {
    contatos.nicho.faixa([nx.x0, ya, zf], [nx.x1, ya, zf], [nx.x1, ya + 0.09, zf], [nx.x0, ya + 0.09, zf], 0.72);
    contatos.nicho.faixa([nx.x0, ya, zf], [nx.x0, yb, zf], [nx.x0 + 0.07, yb, zf], [nx.x0 + 0.07, ya, zf], 0.76);
    contatos.nicho.faixa([nx.x1, yb, zf], [nx.x1, ya, zf], [nx.x1 - 0.07, ya, zf], [nx.x1 - 0.07, yb, zf], 0.76);
  }
  const vaso = m.malha(torneado([[0, 0], [0.05, 0], [0.068, 0.05], [0.06, 0.14], [0.03, 0.2], [0.034, 0.23], [0, 0.23]], 28), 'ceramicaEscura', nicho);
  vaso.position.set(1.48, AEREO.y0 + CHAPA, 0.16);
  const vaso2 = m.malha(new THREE.SphereGeometry(0.075, 28, 18), 'ceramica', nicho);
  vaso2.scale.set(1, 1.15, 1);
  vaso2.position.set(1.66, AEREO.y0 + CHAPA + 0.085, 0.17);
  ([[1.78, 0.2, 'livro'], [1.81, 0.18, 'livro2'], [1.845, 0.21, 'livro']] as const).forEach(([x, h, p]) =>
    m.bloco([x, yPrat + CHAPA / 2, 0.05], [x + 0.03, yPrat + CHAPA / 2 + h, 0.26], p, { pai: nicho, raio: 0.002 }),
  );
  const tigela = m.malha(torneado([[0, 0], [0.05, 0], [0.09, 0.03], [0.1, 0.055], [0.094, 0.055], [0.05, 0.012], [0, 0.012]], 28), 'ceramica', nicho);
  tigela.position.set(2.0, yPrat + CHAPA / 2, 0.15);

  /* ---------- objetos da bancada (com moderação) ---------- */
  const tabua = m.bloco([2.32, yTopo, 0.03], [2.6, yTopo + 0.4, 0.05], 'decoMadeira', { pai: principal, raio: 0.006, veio: 'vertical' });
  tabua.rotation.x = -0.12;
  tabua.position.z += 0.02;
  for (const [x, h, r] of [[0.8, 0.2, 0.05], [0.93, 0.15, 0.045]] as const) {
    const pote = m.malha(torneado([[0, 0], [r - 0.004, 0], [r, 0.004], [r, h], [0, h]], 28), 'ceramica', principal);
    pote.position.set(x, yTopo, 0.14);
    const tampa = m.malha(new THREE.CylinderGeometry(r * 0.98, r * 0.98, 0.015, 28), 'decoMadeira', principal);
    tampa.position.set(x, yTopo + h + 0.0075, 0.14);
    contatos.fundo.disco(x, 0.14, yTopo + 0.0007, r * 1.5, 0.66);
  }

  /* ---------- oliveira junto à janela: vaso, tronco, galhos e folhas (um só desenho repetido) ---------- */
  const folhagem = (() => {
    const P: V3 = [0.62, 0, 5.05];
    const vasoP = m.malha(torneado([[0, 0], [0.17, 0], [0.22, 0.42], [0.235, 0.46], [0.205, 0.46], [0.2, 0.42], [0, 0.42]], 36), 'ceramicaEscura', principal);
    vasoP.position.set(...P);
    const terra = m.malha(new THREE.CircleGeometry(0.2, 28), 'terra', principal);
    terra.rotation.x = -Math.PI / 2;
    terra.position.set(P[0], 0.42, P[2]);
    const galho = (pts: V3[], r: number) =>
      m.malha(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(P[0] + q[0], q[1], P[2] + q[2]))), 14, r, 7, false), 'galho', principal);
    galho([[0, 0.4, 0], [0.02, 0.8, 0.01], [-0.01, 1.2, 0.03], [0.03, 1.55, 0.02]], 0.02);
    const pontas: V3[] = [[0.03, 2.05, 0.05], [-0.28, 1.86, 0.12], [0.3, 1.82, -0.1], [-0.12, 1.66, -0.24], [0.16, 1.62, 0.26]];
    for (const q of pontas) galho([[0.02, 1.32, 0.02], [q[0] * 0.5, (1.32 + q[1]) / 2, q[2] * 0.5], q], 0.008);
    const folhaGeo = new THREE.BufferGeometry();
    folhaGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.012, 0.004, 0.03, 0, 0.006, 0.07, -0.012, 0.004, 0.03], 3));
    folhaGeo.setIndex([0, 1, 2, 0, 2, 3]);
    folhaGeo.computeVertexNormals();
    const qtd = leve ? 260 : 560;
    const copa = new THREE.InstancedMesh(folhaGeo, materiais.fixos.folha, qtd);
    const mat = new THREE.Matrix4();
    const q4 = new THREE.Quaternion();
    const eul = new THREE.Euler();
    const esc = new THREE.Vector3();
    const posi = new THREE.Vector3();
    const tom = new THREE.Color();
    let semente = 7;
    const acaso2 = () => (semente = (semente * 48271) % 2147483647) / 2147483647;
    for (let i = 0; i < qtd; i++) {
      const c = pontas[i % pontas.length];
      const raioCopa = 0.34;
      posi.set(P[0] + c[0] * 0.8 + (acaso2() - 0.5) * raioCopa * 2, c[1] - 0.05 + (acaso2() - 0.5) * raioCopa * 1.4, P[2] + c[2] * 0.8 + (acaso2() - 0.5) * raioCopa * 2);
      eul.set(acaso2() * 6.28, acaso2() * 6.28, acaso2() * 6.28);
      q4.setFromEuler(eul);
      const s = 0.8 + acaso2() * 0.7;
      esc.set(s, s, s);
      mat.compose(posi, q4, esc);
      copa.setMatrixAt(i, mat);
      const v = 0.72 + acaso2() * 0.5;
      tom.setRGB(v * (0.88 + acaso2() * 0.2), v, v * 0.9);
      copa.setColorAt(i, tom);
    }
    copa.castShadow = true;
    copa.userData.manter = true;
    copa.frustumCulled = false;
    principal.add(copa);
    m.registrar(copa, 'folha');
    contatos.piso.disco(P[0], P[2], yp, 0.48, 0.55);
    return copa;
  })();

  /* ---------- ilha ---------- */
  const I = ILHA;
  // estrutura (mundo), laterais aparentes em painel e ripado do lado das banquetas
  m.bloco([I.x0, RODAPE, I.z0], [I.x1, RODAPE + CHAPA, I.z1], 'estrutura', { pai: ilha });
  m.bloco([I.x0, BASE.y1 - CHAPA, I.z0], [I.x1, BASE.y1, I.z1], 'estrutura', { pai: ilha });
  m.bloco([I.x0 + 0.03, 0, I.z0 + 0.05], [I.x1 - 0.03, RODAPE, I.z1 - 0.05], 'sombra', { pai: ilha, raio: 0, sombra: false });
  for (const x of [I.x0 + 0.633, I.x0 + 1.266]) m.bloco([x - CHAPA / 2, RODAPE, I.z0], [x + CHAPA / 2, BASE.y1, I.z1 - 0.3], 'estrutura', { pai: ilha });
  m.bloco([I.x0, RODAPE, I.z1 - 0.3], [I.x1, BASE.y1, I.z1 - 0.3 + CHAPA], 'estrutura', { pai: ilha });
  m.bloco([I.x0 - CHAPA, 0, I.z0 - CHAPA], [I.x0, BASE.y1, I.z1 + CHAPA], 'paineis', { pai: ilha, veio: 'vertical' });
  m.bloco([I.x1, 0, I.z0 - CHAPA], [I.x1 + CHAPA, BASE.y1, I.z1 + CHAPA], 'paineis', { pai: ilha, veio: 'vertical' });
  m.bloco([I.x0, RODAPE, I.z1 - 0.008], [I.x1, BASE.y1, I.z1], 'sombra', { pai: ilha, raio: 0, sombra: false });
  for (let x = I.x0 + 0.012; x + 0.035 <= I.x1 - 0.008; x += 0.05) {
    m.bloco([x, 0.006, I.z1], [x + 0.035, BASE.y1 - 0.004, I.z1 + 0.02], 'paineis', { pai: ilha, raio: 0, veio: 'vertical' });
  }
  // gavetas do lado da cozinha: frentes viradas para a parede do fundo (grupo girado 180°)
  const frenteIlha = new THREE.Group();
  frenteIlha.position.set((I.x0 + I.x1) / 2, 0, I.z0);
  frenteIlha.rotation.y = Math.PI;
  ilha.add(frenteIlha);
  const meia = (I.x1 - I.x0) / 2;
  for (let c = 0; c < 3; c++) {
    const lx0 = -meia + c * 0.633;
    const lx1 = c === 2 ? meia : lx0 + 0.633;
    const nomes = ['esquerda', 'central', 'direita'];
    m.gaveta(frenteIlha, frente(lx0, lx1, RODAPE, 0.5, 0), { id: `ilha-${c}-b`, nome: `Gavetão da ilha (${nomes[2 - c]})`, grupo: 'Ilha', prof: 0.52 });
    m.gaveta(frenteIlha, frente(lx0, lx1, 0.5, BASE.y1, 0), { id: `ilha-${c}-a`, nome: `Gaveta da ilha (${nomes[2 - c]})`, grupo: 'Ilha', prof: 0.52, organizador: c === 1 });
  }
  // tampo com balanço de 33 cm para as banquetas e mãos-francesas de aço embaixo
  const tampoIlha = { x0: I.x0 - 0.05, x1: I.x1 + 0.05, z0: I.z0 - 0.04, z1: I.z1 + 0.33 };
  pedra([tampoIlha.x0, BASE.y1, tampoIlha.z0], [tampoIlha.x1, yTopo, tampoIlha.z1], ilha);
  saias.push(
    pedra([tampoIlha.x0, BASE.y1 - 0.04, tampoIlha.z0], [tampoIlha.x1, BASE.y1, tampoIlha.z0 + 0.02], ilha, true),
    pedra([tampoIlha.x0, BASE.y1 - 0.04, tampoIlha.z1 - 0.02], [tampoIlha.x1, BASE.y1, tampoIlha.z1], ilha, true),
    pedra([tampoIlha.x0, BASE.y1 - 0.04, tampoIlha.z0], [tampoIlha.x0 + 0.02, BASE.y1, tampoIlha.z1], ilha, true),
    pedra([tampoIlha.x1 - 0.02, BASE.y1 - 0.04, tampoIlha.z0], [tampoIlha.x1, BASE.y1, tampoIlha.z1], ilha, true),
  );
  for (const x of [I.x0 + 0.3, I.x1 - 0.3]) {
    m.bloco([x - 0.02, BASE.y1 - 0.008, I.z1 + 0.02], [x + 0.02, BASE.y1, tampoIlha.z1 - 0.06], 'caixilho', { pai: ilha, raio: 0, sombra: false });
  }
  // módulo de tomadas na lateral da ilha
  m.bloco([I.x1 + CHAPA, 0.62, 2.1], [I.x1 + CHAPA + 0.006, 0.74, 2.18], 'tomada', { pai: ilha, raio: 0.002, sombra: false });
  contatos.ilha.retangulo(I.x0 - CHAPA, I.z0 - CHAPA, I.x1 + CHAPA, I.z1 + 0.02, yp + 0.0005, 0.52, 0.56);
  // banquetas: assento torneado com aro de madeira, quatro pernas e descanso de pés
  for (const x of [1.78, 2.62]) {
    const assento = m.malha(torneado([[0, 0], [0.17, 0], [0.188, 0.012], [0.192, 0.04], [0.175, 0.062], [0.1, 0.072], [0, 0.074]], 36), 'tecido', ilha);
    assento.position.set(x, 0.655, 3.12);
    const aroSup = m.malha(new THREE.CylinderGeometry(0.15, 0.135, 0.018, 32), 'decoMadeira', ilha);
    aroSup.position.set(x, 0.648, 3.12);
    const aro = m.malha(new THREE.TorusGeometry(0.15, 0.006, 8, 40), 'pretoFosco', ilha);
    aro.rotation.x = Math.PI / 2;
    aro.position.set(x, 0.26, 3.12);
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const perna = m.malha(new THREE.CylinderGeometry(0.0085, 0.0105, 0.65, 10), 'pretoFosco', ilha);
      perna.position.set(x + Math.cos(ang) * 0.148, 0.32, 3.12 + Math.sin(ang) * 0.148);
      perna.rotation.set(Math.sin(ang) * 0.09, 0, -Math.cos(ang) * 0.09);
    }
    contatos.ilha.disco(x, 3.12, yp + 0.0005, 0.36, 0.72);
  }
  // fruteira
  const fruteira = m.malha(torneado([[0, 0], [0.06, 0], [0.15, 0.05], [0.175, 0.075], [0.168, 0.075], [0.13, 0.05], [0.05, 0.012], [0, 0.012]], 36), 'ceramica', ilha);
  fruteira.position.set(2.45, yTopo, 2.3);
  contatos.ilha.disco(2.45, 2.3, yTopo + 0.0007, 0.2, 0.62);
  for (const [dx, dz, mat, r] of [[-0.05, 0.02, 'fruta', 0.04], [0.05, -0.03, 'limao', 0.036], [0.02, 0.06, 'fruta', 0.041], [-0.03, -0.06, 'limao', 0.035]] as const) {
    const f = m.malha(new THREE.SphereGeometry(r, 20, 14), mat, ilha);
    f.position.set(2.45 + dx, yTopo + 0.012 + r, 2.3 + dz);
  }
  // pendentes: cúpula torneada, colar, fio e canopla no forro
  for (const x of [1.86, 2.54]) {
    const cupula = m.malha(torneado([[0.018, 0.23], [0.03, 0.225], [0.06, 0.2], [0.12, 0.12], [0.15, 0.03], [0.152, 0]], 40), 'pretoFosco', ilha);
    cupula.position.set(x, 1.72, 2.3);
    const fio = m.malha(new THREE.CylinderGeometry(0.0022, 0.0022, H - 1.95, 6), 'pretoFosco', ilha, false);
    fio.position.set(x, 1.95 + (H - 1.95) / 2, 2.3);
    const canopla = m.malha(new THREE.CylinderGeometry(0.045, 0.05, 0.018, 28), 'pretoFosco', ilha, false);
    canopla.position.set(x, H - 0.009, 2.3);
    const difusor = new THREE.Mesh(new THREE.CircleGeometry(0.146, 40), materiais.fixos.luminaria);
    geometriasAvulsas.push(difusor.geometry);
    difusor.rotation.x = Math.PI / 2;
    difusor.position.set(x, 1.725, 2.3);
    difusor.userData.manter = true;
    ilha.add(difusor);
    visuais.pendentes.push(difusor);
    pontos.push({ grupo: 'pendentes', pos: [x, 1.68, 2.3], dir: [0, -1, 0], cone: 0.05, alcance: 3.2, intensidade: 1.6 });
  }

  /* ---------- spots embutidos na sanca do fundo ---------- */
  for (const x of [0.95, 1.85, 2.75, 3.65]) {
    const z = 0.82;
    const aroS = m.malha(new THREE.CylinderGeometry(0.05, 0.05, 0.004, 28), 'rodapeParede', teto, false);
    aroS.position.set(x, SANCA.y - 0.001, z);
    const disco = new THREE.Mesh(new THREE.CircleGeometry(0.036, 24), materiais.fixos.spot);
    geometriasAvulsas.push(disco.geometry);
    disco.rotation.x = Math.PI / 2;
    disco.position.set(x, SANCA.y - 0.0035, z);
    disco.userData.manter = true;
    teto.add(disco);
    visuais.spots.push(disco);
    pontos.push({ grupo: 'spots', pos: [x, SANCA.y - 0.02, z], dir: [0, -1, 0], cone: 0.72, alcance: 3.6, intensidade: 2.6 });
  }

  /* ---------- luz natural: sol (com sombra), claridade da janela e rebote no piso ---------- */
  const sol = new THREE.DirectionalLight('#fff1dd', 3);
  sol.position.set(-6.5, 4.6, 5.6);
  sol.target.position.set(2.2, 0, 2.6);
  raiz.add(sol, sol.target);
  sol.castShadow = true;
  const resolucao = leve ? 1024 : 1536;
  sol.shadow.mapSize.set(resolucao, resolucao);
  Object.assign(sol.shadow.camera, { left: -5.6, right: 5.6, top: 4.2, bottom: -4.2, near: 1, far: 22 });
  sol.shadow.camera.updateProjectionMatrix();
  sol.shadow.bias = -0.0004;
  sol.shadow.normalBias = 0.018;
  sol.shadow.radius = 2.5;
  pontos.push({ grupo: 'janela', pos: [0.15, 1.35, (J.z0 + J.z1) / 2], dir: [1, 0, 0], cone: -0.35, alcance: 7.5, intensidade: 1 });
  pontos.push({ grupo: 'rebote', pos: [3.1, 0.15, 2.3], alcance: 5, intensidade: 1 });
  pontos.push({ grupo: 'indireta', pos: [L / 2, SANCA.y + 0.05, D / 2 + 0.3], alcance: 6.5, intensidade: 2 });

  /* ---------- sombras de contato e fusão das peças estáticas ---------- */
  const anexar = (c: Contatos, pai: THREE.Object3D) => {
    const malha = c.criar(materiais.fixos.contato);
    if (!malha) return;
    malha.userData.manter = true;
    geometriasAvulsas.push(malha.geometry);
    pai.add(malha);
  };
  anexar(contatos.piso, principal);
  anexar(contatos.fundo, principal);
  anexar(contatos.ilha, ilha);
  anexar(contatos.nicho, nicho);
  anexar(contatos.direita, direita);
  anexar(contatos.frontal, frontal);
  anexar(contatos.esquerda, esquerda);
  anexar(contatos.teto, teto);

  m.mesclar(principal);
  m.mesclar(ilha);
  m.mesclar(nicho);
  m.mesclar(fechados);
  paredes.forEach((p) => m.mesclar(p.grupo));

  const f = materiais.fixos;
  const emissivos = [
    { material: f.led, forca: 7 },
    { material: f.luminaria, forca: 7 },
    { material: f.spot, forca: 10 },
    { material: f.indireta, forca: 1.15 },
  ];
  let ilhaVisivel = true;

  return {
    montagem: m,
    vistas: {
      inicial: { pos: [4.2, 1.5, 5.95], alvo: [2.0, 1.0, 1.0] },
      frente: { pos: [2.3, 1.42, 5.95], alvo: [2.3, 1.14, 0.8] },
      lateral: { pos: [0.72, 1.55, 4.2], alvo: [3.1, 0.98, 1.15] },
      superior: { pos: [2.3, 9.6, 2.87], alvo: [2.3, 0, 2.8] },
      ilha: { pos: [3.95, 1.22, 4.2], alvo: [2.25, 0.84, 2.0] },
      ampla: { pos: [8.8, 5.4, 9.6], alvo: [2.3, 0.9, 2.5] },
    },
    limitesAlvo: { min: [0.3, 0.2, 0.3], max: [4.3, 2.0, 5.0] },
    distancia: [0.9, 14],
    sala: { min: [0, 0, 0], max: [L, H, D], sonda: [2.3, 1.45, 3.3] },
    sol: { luz: sol, dia: [-6.5, 4.6, 5.6], tarde: [-7.5, 2.5, 6.6] },
    sombras,
    exterior: materiais.fixos.exterior,
    pontos,
    linhas,
    visuais,
    emissivos,
    aplicarComposicao(c) {
      ilha.visible = c.composicao.ilha;
      ilhaVisivel = ilha.visible;
      nicho.visible = c.composicao.aereos === 'nicho';
      fechados.visible = !nicho.visible;
      saias.forEach((s) => (s.visible = c.bancada.espessura === 'encorpada'));
    },
    atualizarCortes(camera) {
      let mudou = false;
      for (const p of paredes) {
        const v = p.visivel(camera);
        if (p.grupo.visible !== v) {
          p.grupo.visible = v;
          if (p.corte) p.corte.visible = !v;
          mudou = true;
        }
      }
      return mudou;
    },
    salaInteira(ativa) {
      if (!ativa) return;
      paredes.forEach((p) => {
        p.grupo.visible = true;
        if (p.corte) p.corte.visible = false;
      });
    },
    zonas() {
      const z: { min: V3; max: V3 }[] = [{ min: [-0.3, 0, -50], max: [L + 0.3, H + 0.2, 0.74] }];
      if (ilhaVisivel) z.push({ min: [1.1, 0, 1.52], max: [3.3, 1.08, 3.04] });
      z.push({ min: [0.05, 0, 4.55], max: [1.2, 2.25, 5.55] }); // a oliveira
      return z;
    },
    articulacoesVisiveis() {
      const visivel = (a: Articulacao) => {
        for (let o: THREE.Object3D | null = a.no; o; o = o.parent) if (!o.visible) return false;
        return true;
      };
      return m.articulacoes.filter(visivel);
    },
    dispose() {
      sol.shadow.dispose();
      sol.dispose();
      materiais.fixos.exterior.map = null;
      folhagem.dispose();
      m.dispose();
      texturas.forEach((t) => t.dispose());
      geometriasAvulsas.forEach((g) => g.dispose());
      materialSombra.dispose();
    },
  };
};
