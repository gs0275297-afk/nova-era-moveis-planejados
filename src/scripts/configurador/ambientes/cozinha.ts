import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import type { Luz } from '../catalogo';
import { CHAPA, FOLGA, Montagem, type Articulacao, type V3 } from '../moveis';
import type { GrupoLuz, MontarAmbiente } from './tipos';

/*
 * Cozinha planejada (simulação ilustrativa, não é um projeto executado pela Nova Era).
 * Eixos: x ao longo da parede do fundo, y para cima, z saindo da parede em direção a quem olha.
 *
 * Parede do fundo, da esquerda para a direita:
 *   torre quente (forno + micro-ondas) | gaveteiro | pia | armário | cooktop | porta-temperos | geladeira embutida
 * Em cima: armários superiores com nicho aberto (ou fechados), depurador e painel até o teto.
 * À frente: ilha com gavetas do lado da cozinha, ripado e banquetas do outro lado.
 * Medidas usuais de marcenaria: rodapé recuado de 12 cm, bancada a 90 cm, superiores 60 cm acima dela.
 */

const SALA = { L: 4.6, D: 4.4, H: 2.7, E: 0.12 };
const RODAPE = 0.12;
const BASE = { y1: 0.87, prof: 0.56 };
const TAMPO = 0.03;
const AEREO = { y0: 1.5, y1: 2.25, prof: 0.33 };
const ALTO = { y1: 2.25, prof: 0.58 };
const ILHA = { x0: 1.25, x1: 3.15, z0: 1.7, z1: 2.6 };
const JANELA = { z0: 1.6, z1: 2.9, y0: 1.0, y1: 2.3 };

// As tabelas das luzes de área são globais: criar de novo a cada montagem deixaria texturas na GPU.
let luzesDeAreaProntas = false;
const prepararLuzesDeArea = () => {
  if (!luzesDeAreaProntas) RectAreaLightUniformsLib.init();
  luzesDeAreaProntas = true;
};

/** retângulo de frente com folga em volta */
const frente = (x0: number, x1: number, y0: number, y1: number, z: number) => ({
  x0: x0 + FOLGA / 2,
  x1: x1 - FOLGA / 2,
  y0: y0 + FOLGA / 2,
  y1: y1 - FOLGA / 2,
  z,
});

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

  const luzes: Record<Luz, GrupoLuz> = {
    led: { luzes: [], intensidades: [], visuais: [] },
    nichos: { luzes: [], intensidades: [], visuais: [] },
    pendentes: { luzes: [], intensidades: [], visuais: [] },
    spots: { luzes: [], intensidades: [], visuais: [] },
  };
  const addLuz = (grupo: Luz, luz: THREE.Light, intensidade: number, pai: THREE.Object3D = raiz) => {
    luz.intensity = intensidade;
    pai.add(luz);
    luzes[grupo].luzes.push(luz);
    luzes[grupo].intensidades.push(intensidade);
  };

  /* ---------- auxiliares ---------- */
  const rodape = (pai: THREE.Object3D, x0: number, x1: number, zFrente: number) =>
    m.bloco([x0, 0, 0.03], [x1, RODAPE, zFrente - 0.05], 'estrutura', { pai, raio: 0.001 });

  // Halo das luzes: degradê aditivo sobre parede e bancada (o brilho que uma foto real mostraria).
  const degrade = (radial: boolean) => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    const g = radial ? ctx.createRadialGradient(64, 64, 0, 64, 64, 64) : ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(radial ? 0.4 : 0.22, 'rgba(255,255,255,0.42)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    texturas.push(t);
    return t;
  };
  const linear = degrade(false);
  const radial = degrade(true);
  const materiaisHalo: THREE.MeshBasicMaterial[] = [];
  const halo = (grupo: Luz, w: number, h: number, pos: V3, rot: V3, mapa: THREE.Texture, opacidade: number, pai: THREE.Object3D = raiz) => {
    const material = new THREE.MeshBasicMaterial({
      map: mapa,
      color: '#ffc98f',
      transparent: true,
      opacity: opacidade,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    materiaisHalo.push(material);
    const geo = new THREE.PlaneGeometry(w, h);
    geometriasAvulsas.push(geo);
    const malha = new THREE.Mesh(geo, material);
    malha.position.set(...pos);
    malha.rotation.set(...rot);
    malha.renderOrder = 2;
    pai.add(malha);
    luzes[grupo].visuais.push(malha);
    return malha;
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
  const parede = (blocos: [V3, V3][], visivel: (c: THREE.Vector3) => boolean, papel = 'parede') => {
    const grupo = new THREE.Group();
    grupo.userData.manter = true;
    raiz.add(grupo);
    const corte = new THREE.Group();
    corte.userData.manter = true;
    corte.visible = false;
    raiz.add(corte);
    for (const [min, max] of blocos) {
      m.bloco(min, max, papel, { pai: grupo, raio: 0, sombra: false });
      // tampa escura no topo: a parede aparece "cortada", como numa planta
      if (max[1] >= SALA.H - 0.001 && papel === 'parede') m.bloco([min[0], max[1], min[2]], [max[0], max[1] + 0.004, max[2]], 'corte', { pai: grupo, raio: 0, sombra: false });
      if (min[1] <= 0.001) m.bloco([min[0], 0, min[2]], [max[0], 0.05, max[2]], 'corte', { pai: corte, raio: 0, sombra: false });
      proxy(min, max);
    }
    paredes.push({ grupo, corte, visivel });
    return grupo;
  };
  const { L, D, H, E } = SALA;
  parede([[[-E, 0, -E], [L + E, H, 0]]], (c) => c.z > 0.02);
  const esquerda = parede(
    [
      [[-E, 0, 0], [0, H, JANELA.z0]],
      [[-E, 0, JANELA.z1], [0, H, D]],
      [[-E, 0, JANELA.z0], [0, JANELA.y0, JANELA.z1]],
      [[-E, JANELA.y1, JANELA.z0], [0, H, JANELA.z1]],
    ],
    (c) => c.x > 0.02,
  );
  const direita = parede([[[L, 0, 0], [L + E, H, D]]], (c) => c.x < L - 0.02);
  // o teto só aparece com a câmera dentro do ambiente (de fora, a maquete fica aberta por cima)
  const teto = parede([[[0, H, 0], [L, H + 0.06, D]]], (c) => c.y < H - 0.03 && c.x > 0 && c.x < L && c.z < D, 'teto');
  m.bloco([-E, -0.03, -E], [L + E, 0, D], 'piso', { raio: 0, sombra: false, pai: principal, veio: 'horizontal' });
  // rodapé das paredes laterais
  m.bloco([0, 0, ALTO.prof + CHAPA], [0.012, 0.08, D], 'teto', { pai: esquerda, raio: 0.002, sombra: false });
  m.bloco([L - 0.012, 0, ALTO.prof + CHAPA], [L, 0.08, D], 'teto', { pai: direita, raio: 0.002, sombra: false });

  // Janela: caixilho, vidro e "céu" do lado de fora (cor muda com o cenário de luz).
  const caixilho = (min: V3, max: V3) => m.bloco(min, max, 'pretoFosco', { pai: esquerda, raio: 0.002, sombra: false });
  caixilho([-0.09, JANELA.y0, JANELA.z0], [-0.03, JANELA.y0 + 0.04, JANELA.z1]);
  caixilho([-0.09, JANELA.y1 - 0.04, JANELA.z0], [-0.03, JANELA.y1, JANELA.z1]);
  caixilho([-0.09, JANELA.y0, JANELA.z0], [-0.03, JANELA.y1, JANELA.z0 + 0.04]);
  caixilho([-0.09, JANELA.y0, JANELA.z1 - 0.04], [-0.03, JANELA.y1, JANELA.z1]);
  caixilho([-0.09, JANELA.y0, (JANELA.z0 + JANELA.z1) / 2 - 0.02], [-0.03, JANELA.y1, (JANELA.z0 + JANELA.z1) / 2 + 0.02]);
  m.bloco([-0.07, JANELA.y0 + 0.04, JANELA.z0 + 0.04], [-0.06, JANELA.y1 - 0.04, JANELA.z1 - 0.04], 'vidro', { pai: esquerda, raio: 0, sombra: false });
  m.bloco([-0.02, JANELA.y0 - 0.03, JANELA.z0 - 0.04], [0.04, JANELA.y0, JANELA.z1 + 0.04], 'ceramica', { pai: esquerda, raio: 0.003, sombra: false });
  // colado na face externa da parede e do tamanho do vão: nunca aparece por cima da parede
  const geoCeu = new THREE.PlaneGeometry(JANELA.z1 - JANELA.z0 + 0.1, JANELA.y1 - JANELA.y0 + 0.1);
  geometriasAvulsas.push(geoCeu);
  // céu claro em cima, mais denso no horizonte; o cenário de luz tinge pela cor do material
  const telaCeu = document.createElement('canvas');
  telaCeu.width = 4;
  telaCeu.height = 128;
  const ctxCeu = telaCeu.getContext('2d')!;
  const gradeCeu = ctxCeu.createLinearGradient(0, 0, 0, 128);
  gradeCeu.addColorStop(0, '#d2e2f2');
  gradeCeu.addColorStop(0.6, '#ffffff');
  gradeCeu.addColorStop(0.8, '#fbf6ec');
  gradeCeu.addColorStop(0.82, '#9aa892');
  gradeCeu.addColorStop(1, '#7f8c78');
  ctxCeu.fillStyle = gradeCeu;
  ctxCeu.fillRect(0, 0, 4, 128);
  const texCeu = new THREE.CanvasTexture(telaCeu);
  texCeu.colorSpace = THREE.SRGBColorSpace;
  texturas.push(texCeu);
  materiais.fixos.exterior.map = texCeu;
  materiais.fixos.exterior.needsUpdate = true;
  const ceu = new THREE.Mesh(geoCeu, materiais.fixos.exterior);
  ceu.position.set(-E - 0.002, (JANELA.y0 + JANELA.y1) / 2, (JANELA.z0 + JANELA.z1) / 2);
  ceu.rotation.y = Math.PI / 2;
  esquerda.add(ceu);

  /* ---------- torre quente (forno e micro-ondas), x 0,03–0,65 ---------- */
  const T = { x0: 0.03, x1: 0.65 };
  m.bloco([0, 0, 0], [T.x0, H, ALTO.prof + CHAPA], 'paineis', { pai: principal, veio: 'vertical' });
  m.caixaModulo(principal, T.x0, T.x1, RODAPE, ALTO.y1, ALTO.prof);
  [0.72, 1.38, 1.8].forEach((y) => m.bloco([T.x0 + CHAPA, y - CHAPA, 0.01], [T.x1 - CHAPA, y, ALTO.prof], 'estrutura', { pai: principal, raio: 0.001 }));
  rodape(principal, T.x0, T.x1, ALTO.prof);
  m.gaveta(principal, frente(T.x0, T.x1, RODAPE, 0.42, ALTO.prof), { id: 'torre-g1', nome: 'Gaveta inferior da torre', grupo: 'Torre quente', prof: 0.5 });
  m.gaveta(principal, frente(T.x0, T.x1, 0.42, 0.72, ALTO.prof), { id: 'torre-g2', nome: 'Gaveta da torre', grupo: 'Torre quente', prof: 0.5 });
  const eletro = (y0: number, y1: number, vidroY0: number) => {
    m.bloco([T.x0 + 0.004, y0, ALTO.prof], [T.x1 - 0.004, y1, ALTO.prof + 0.02], 'inox', { pai: principal, raio: 0.003 });
    m.bloco([T.x0 + 0.03, vidroY0, ALTO.prof + 0.02], [T.x1 - 0.03, y1 - 0.06, ALTO.prof + 0.026], 'vidroPreto', { pai: principal, raio: 0.003 });
    const barra = new THREE.CylinderGeometry(0.008, 0.008, T.x1 - T.x0 - 0.16, 16);
    const b = m.malha(barra, 'inox', principal);
    b.rotation.z = Math.PI / 2;
    b.position.set((T.x0 + T.x1) / 2, y1 - 0.035, ALTO.prof + 0.05);
    for (const s of [-1, 1]) {
      const pe = m.malha(new THREE.CylinderGeometry(0.005, 0.005, 0.03, 10), 'inox', principal);
      pe.rotation.x = Math.PI / 2;
      pe.position.set((T.x0 + T.x1) / 2 + s * ((T.x1 - T.x0) / 2 - 0.1), y1 - 0.035, ALTO.prof + 0.035);
    }
  };
  eletro(0.725, 1.375, 0.76);
  eletro(1.385, 1.795, 1.41);
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
      m.gaveta(principal, frente(x0, x1, cortes[i], cortes[i + 1], zb), { id: `${prefixo}-${i + 1}`, nome: nomes[i], grupo, prof: 0.5 });
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

  /* ---------- bancada, cuba, torneira e cooktop ---------- */
  const yT = BASE.y1;
  const pedra = (min: V3, max: V3, pai: THREE.Object3D = principal, manter = false) =>
    m.bloco(min, max, 'bancada', { pai, raio: 0.002, veio: 'horizontal', manter });
  const CUBA = { x0: 1.43, x1: 1.97, z0: 0.1, z1: 0.48, fundo: 0.68 };
  pedra([0.65, yT, 0], [CUBA.x0, yT + TAMPO, 0.62]);
  pedra([CUBA.x1, yT, 0], [3.85, yT + TAMPO, 0.62]);
  pedra([CUBA.x0, yT, 0], [CUBA.x1, yT + TAMPO, CUBA.z0]);
  pedra([CUBA.x0, yT, CUBA.z1], [CUBA.x1, yT + TAMPO, 0.62]);
  pedra([0.65, yT + TAMPO, 0], [3.85, yT + TAMPO + 0.1, 0.015]); // frontão
  // "saia": borda frontal que deixa a bancada encorpada (opção de espessura aparente)
  const saias: THREE.Mesh[] = [pedra([0.65, yT - 0.04, 0.6], [3.85, yT, 0.62], principal, true)];
  // cuba de inox
  const cuba: [V3, V3][] = [
    [[CUBA.x0, CUBA.fundo, CUBA.z0], [CUBA.x1, CUBA.fundo + 0.004, CUBA.z1]],
    [[CUBA.x0, CUBA.fundo, CUBA.z0], [CUBA.x0 + 0.004, yT + TAMPO - 0.002, CUBA.z1]],
    [[CUBA.x1 - 0.004, CUBA.fundo, CUBA.z0], [CUBA.x1, yT + TAMPO - 0.002, CUBA.z1]],
    [[CUBA.x0, CUBA.fundo, CUBA.z0], [CUBA.x1, yT + TAMPO - 0.002, CUBA.z0 + 0.004]],
    [[CUBA.x0, CUBA.fundo, CUBA.z1 - 0.004], [CUBA.x1, yT + TAMPO - 0.002, CUBA.z1]],
  ];
  cuba.forEach(([a, b]) => m.bloco(a, b, 'inox', { pai: principal, raio: 0 }));
  const ralo = m.malha(new THREE.CylinderGeometry(0.035, 0.035, 0.003, 24), 'sombra', principal, false);
  ralo.position.set((CUBA.x0 + CUBA.x1) / 2, CUBA.fundo + 0.005, (CUBA.z0 + CUBA.z1) / 2);
  // torneira gourmet: segue o metal escolhido para os puxadores
  const xt = (CUBA.x0 + CUBA.x1) / 2;
  const corpo = m.malha(new THREE.CylinderGeometry(0.016, 0.019, 0.3, 24), 'metal', principal);
  corpo.position.set(xt, yT + TAMPO + 0.15, 0.06);
  const bico = new THREE.CatmullRomCurve3([
    new THREE.Vector3(xt, yT + TAMPO + 0.29, 0.06),
    new THREE.Vector3(xt, yT + TAMPO + 0.4, 0.09),
    new THREE.Vector3(xt, yT + TAMPO + 0.38, 0.2),
    new THREE.Vector3(xt, yT + TAMPO + 0.3, 0.25),
  ]);
  m.malha(new THREE.TubeGeometry(bico, 32, 0.011, 14, false), 'metal', principal);
  const alavanca = m.malha(m.caixa(0.012, 0.012, 0.08, 0.004), 'metal', principal);
  alavanca.position.set(xt + 0.028, yT + TAMPO + 0.22, 0.07);
  alavanca.rotation.x = -0.3;
  // cooktop de vidro com queimadores
  const xc = 3.1;
  m.bloco([xc - 0.29, yT + TAMPO, 0.06], [xc + 0.29, yT + TAMPO + 0.006, 0.56], 'vidroPreto', { pai: principal, raio: 0.004 });
  for (const [dx, dz, r] of [[-0.14, 0.18, 0.07], [0.14, 0.18, 0.055], [-0.14, 0.42, 0.055], [0.14, 0.42, 0.075]] as const) {
    const anel = m.malha(new THREE.TorusGeometry(r, 0.0025, 6, 48), 'inox', principal, false);
    anel.rotation.x = Math.PI / 2;
    anel.position.set(xc + dx, yT + TAMPO + 0.0075, dz);
  }

  /* ---------- armários superiores, y 1,50–2,25 ---------- */
  const za = AEREO.prof;
  const caixaAerea = (x0: number, x1: number, y0 = AEREO.y0, pai: THREE.Object3D = principal, papel = 'estrutura', prateleiras = 1) =>
    m.caixaModulo(pai, x0, x1, y0, AEREO.y1, AEREO.prof, { prateleiras, papel });
  caixaAerea(0.65, 1.25);
  m.porta(principal, frente(0.65, 1.25, AEREO.y0, AEREO.y1, za), { id: 'aereo-1', nome: 'Porta superior esquerda', grupo: 'Armários superiores', lado: 'dir', puxador: 'base' });
  // variante A: nicho aberto iluminado (papel "prateleiras"); variante B: duas portas
  caixaAerea(1.25, 2.15, AEREO.y0, nicho, 'prateleiras', 1);
  caixaAerea(1.25, 2.15, AEREO.y0, fechados, 'estrutura', 1);
  m.porta(fechados, frente(1.25, 1.7, AEREO.y0, AEREO.y1, za), { id: 'aereo-2e', nome: 'Porta superior do meio (esquerda)', grupo: 'Armários superiores', lado: 'esq', puxador: 'base' });
  m.porta(fechados, frente(1.7, 2.15, AEREO.y0, AEREO.y1, za), { id: 'aereo-2d', nome: 'Porta superior do meio (direita)', grupo: 'Armários superiores', lado: 'dir', puxador: 'base' });
  caixaAerea(2.15, 2.65);
  m.porta(principal, frente(2.15, 2.65, AEREO.y0, AEREO.y1, za), { id: 'aereo-3', nome: 'Porta superior', grupo: 'Armários superiores', lado: 'esq', puxador: 'base' });
  // sobre o cooktop: depurador embutido + basculante
  caixaAerea(2.65, 3.55, 1.6, principal, 'estrutura', 0);
  m.bloco([2.66, AEREO.y0, 0.02], [3.54, 1.6, AEREO.prof + CHAPA], 'inox', { pai: principal, raio: 0.003 });
  m.bloco([2.75, AEREO.y0 - 0.002, 0.06], [3.45, AEREO.y0, 0.3], 'sombra', { pai: principal, raio: 0, sombra: false });
  m.basculante(principal, frente(2.65, 3.55, 1.6, AEREO.y1, za), { id: 'aereo-4', nome: 'Basculante sobre o cooktop', grupo: 'Armários superiores' });
  caixaAerea(3.55, 3.85);
  m.porta(principal, frente(3.55, 3.85, AEREO.y0, AEREO.y1, za), { id: 'aereo-5', nome: 'Porta superior estreita', grupo: 'Armários superiores', lado: 'esq', puxador: 'base' });
  // painel até o teto, na profundidade de cada trecho
  m.bloco([T.x0, ALTO.y1, 0], [T.x1, H, ALTO.prof + CHAPA], 'paineis', { pai: principal });
  m.bloco([T.x1, AEREO.y1, 0], [G.x0, H, AEREO.prof + CHAPA], 'paineis', { pai: principal });
  m.bloco([G.x0, ALTO.y1, 0], [G.x1, H, ALTO.prof + CHAPA], 'paineis', { pai: principal });

  // LED sob os superiores: filete, luz de área e halos na parede e na bancada
  m.bloco([0.68, AEREO.y0 - 0.006, 0.27], [3.82, AEREO.y0, 0.3], 'pretoFosco', { pai: principal, raio: 0, sombra: false });
  const filete = m.bloco([0.69, AEREO.y0 - 0.007, 0.275], [3.81, AEREO.y0 - 0.005, 0.295], 'led', { pai: raiz, raio: 0, sombra: false, manter: true });
  luzes.led.visuais.push(filete);
  halo('led', 3.2, 0.62, [2.25, 1.2, 0.017], [0, 0, 0], linear, 0.5);
  halo('led', 3.2, 0.5, [2.25, yT + TAMPO + 0.002, 0.3], [-Math.PI / 2, 0, 0], linear, 0.32);
  if (!leve) {
    prepararLuzesDeArea();
    const fita = new THREE.RectAreaLight('#ffd1a3', 1, 3.1, 0.03);
    fita.position.set(2.25, AEREO.y0 - 0.01, 0.28);
    fita.rotation.x = -Math.PI / 2;
    addLuz('led', fita, 30);
  }

  // nicho aberto: prateleira, objetos e LED sob o topo e sob a prateleira
  const nx = { x0: 1.25 + CHAPA, x1: 2.15 - CHAPA };
  const yPrat = AEREO.y0 + (AEREO.y1 - AEREO.y0) / 2;
  for (const y of [AEREO.y1 - CHAPA, yPrat - CHAPA / 2]) {
    const f = m.bloco([nx.x0 + 0.02, y - 0.004, 0.25], [nx.x1 - 0.02, y, 0.27], 'led', { pai: nicho, raio: 0, sombra: false, manter: true });
    luzes.nichos.visuais.push(f);
    halo('nichos', nx.x1 - nx.x0, 0.32, [(nx.x0 + nx.x1) / 2, y - 0.17, 0.008], [0, 0, 0], linear, 0.38, nicho);
    if (!leve) {
      const l = new THREE.RectAreaLight('#ffd1a3', 1, nx.x1 - nx.x0 - 0.06, 0.02);
      l.position.set((nx.x0 + nx.x1) / 2, y - 0.006, 0.26);
      l.rotation.x = -Math.PI / 2;
      addLuz('nichos', l, 14, nicho);
    }
  }
  const vaso = m.malha(new THREE.CylinderGeometry(0.05, 0.065, 0.2, 28), 'ceramicaEscura', nicho);
  vaso.position.set(1.48, AEREO.y0 + CHAPA + 0.1, 0.16);
  const vaso2 = m.malha(new THREE.SphereGeometry(0.075, 28, 18), 'ceramica', nicho);
  vaso2.scale.set(1, 1.15, 1);
  vaso2.position.set(1.66, AEREO.y0 + CHAPA + 0.085, 0.17);
  [[1.78, 0.2, 'livro'], [1.81, 0.18, 'livro2'], [1.845, 0.21, 'livro']].forEach(([x, h, p]) =>
    m.bloco([x as number, yPrat + CHAPA / 2, 0.05], [(x as number) + 0.03, yPrat + CHAPA / 2 + (h as number), 0.26], p as string, { pai: nicho, raio: 0.002 }),
  );
  const tigela = m.malha(new THREE.SphereGeometry(0.09, 28, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 'ceramica', nicho);
  tigela.position.set(2.0, yPrat + CHAPA / 2 + 0.09, 0.15);
  tigela.scale.set(1, 0.55, 1);

  /* ---------- objetos da bancada (com moderação) ---------- */
  const tabua = m.bloco([2.32, yT + TAMPO, 0.03], [2.6, yT + TAMPO + 0.4, 0.05], 'decoMadeira', { pai: principal, raio: 0.006, veio: 'vertical' });
  tabua.rotation.x = -0.12;
  tabua.position.z += 0.02;
  for (const [x, h, r] of [[0.8, 0.2, 0.05], [0.93, 0.15, 0.045]] as const) {
    const pote = m.malha(new THREE.CylinderGeometry(r, r, h, 28), 'ceramica', principal);
    pote.position.set(x, yT + TAMPO + h / 2, 0.14);
    const tampa = m.malha(new THREE.CylinderGeometry(r * 0.98, r * 0.98, 0.015, 28), 'decoMadeira', principal);
    tampa.position.set(x, yT + TAMPO + h + 0.0075, 0.14);
  }
  // planta junto à janela
  const vasoPlanta = m.malha(new THREE.CylinderGeometry(0.17, 0.13, 0.42, 32), 'ceramicaEscura', principal);
  vasoPlanta.position.set(0.32, 0.21, 3.7);
  const folhagem = new THREE.IcosahedronGeometry(0.2, 1);
  for (const [x, y, z, s] of [[0.32, 0.72, 3.7, 1.1], [0.2, 0.95, 3.62, 0.85], [0.42, 1.05, 3.78, 0.8], [0.3, 1.25, 3.68, 0.65], [0.36, 0.88, 3.86, 0.75]] as const) {
    const f = m.malha(folhagem.clone(), 'folha', principal);
    f.position.set(x, y, z);
    f.scale.set(s, s * 1.25, s);
  }
  folhagem.dispose();

  /* ---------- ilha ---------- */
  const I = ILHA;
  // estrutura (mundo), laterais aparentes em painel e ripado do lado das banquetas
  m.bloco([I.x0, RODAPE, I.z0], [I.x1, RODAPE + CHAPA, I.z1], 'estrutura', { pai: ilha });
  m.bloco([I.x0, BASE.y1 - CHAPA, I.z0], [I.x1, BASE.y1, I.z1], 'estrutura', { pai: ilha });
  m.bloco([I.x0 + 0.03, 0, I.z0 + 0.05], [I.x1 - 0.03, RODAPE, I.z1 - 0.05], 'estrutura', { pai: ilha, raio: 0.001 });
  for (const x of [I.x0 + 0.633, I.x0 + 1.266]) m.bloco([x - CHAPA / 2, RODAPE, I.z0], [x + CHAPA / 2, BASE.y1, I.z1 - 0.3], 'estrutura', { pai: ilha });
  m.bloco([I.x0, RODAPE, I.z1 - 0.3], [I.x1, BASE.y1, I.z1 - 0.3 + CHAPA], 'estrutura', { pai: ilha });
  m.bloco([I.x0 - CHAPA, 0, I.z0 - CHAPA], [I.x0, BASE.y1, I.z1 + CHAPA], 'paineis', { pai: ilha, veio: 'vertical' });
  m.bloco([I.x1, 0, I.z0 - CHAPA], [I.x1 + CHAPA, BASE.y1, I.z1 + CHAPA], 'paineis', { pai: ilha, veio: 'vertical' });
  m.bloco([I.x0, RODAPE, I.z1 - 0.008], [I.x1, BASE.y1, I.z1], 'paineis', { pai: ilha });
  for (let x = I.x0 + 0.012; x + 0.035 <= I.x1 - 0.008; x += 0.05) {
    m.bloco([x, RODAPE + 0.005, I.z1], [x + 0.035, BASE.y1 - 0.005, I.z1 + 0.018], 'paineis', { pai: ilha, raio: 0.002, veio: 'vertical' });
  }
  m.bloco([I.x0, 0, I.z1 - 0.05], [I.x1, RODAPE + 0.005, I.z1 + 0.018], 'paineis', { pai: ilha });
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
    m.gaveta(frenteIlha, frente(lx0, lx1, 0.5, BASE.y1, 0), { id: `ilha-${c}-a`, nome: `Gaveta da ilha (${nomes[2 - c]})`, grupo: 'Ilha', prof: 0.52 });
  }
  // tampo com balanço de 33 cm para as banquetas
  const tampoIlha = { x0: I.x0 - 0.05, x1: I.x1 + 0.05, z0: I.z0 - 0.04, z1: I.z1 + 0.33 };
  pedra([tampoIlha.x0, BASE.y1, tampoIlha.z0], [tampoIlha.x1, BASE.y1 + TAMPO, tampoIlha.z1], ilha);
  saias.push(
    pedra([tampoIlha.x0, BASE.y1 - 0.04, tampoIlha.z0], [tampoIlha.x1, BASE.y1, tampoIlha.z0 + 0.02], ilha, true),
    pedra([tampoIlha.x0, BASE.y1 - 0.04, tampoIlha.z1 - 0.02], [tampoIlha.x1, BASE.y1, tampoIlha.z1], ilha, true),
    pedra([tampoIlha.x0, BASE.y1 - 0.04, tampoIlha.z0], [tampoIlha.x0 + 0.02, BASE.y1, tampoIlha.z1], ilha, true),
    pedra([tampoIlha.x1 - 0.02, BASE.y1 - 0.04, tampoIlha.z0], [tampoIlha.x1, BASE.y1, tampoIlha.z1], ilha, true),
  );
  // banquetas
  for (const x of [1.78, 2.62]) {
    const assento = m.malha(new THREE.CylinderGeometry(0.19, 0.18, 0.06, 40), 'tecido', ilha);
    assento.position.set(x, 0.66, 3.12);
    const aro = m.malha(new THREE.TorusGeometry(0.15, 0.007, 8, 40), 'pretoFosco', ilha);
    aro.rotation.x = Math.PI / 2;
    aro.position.set(x, 0.26, 3.12);
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const perna = m.malha(new THREE.CylinderGeometry(0.009, 0.011, 0.66, 10), 'pretoFosco', ilha);
      perna.position.set(x + Math.cos(ang) * 0.145, 0.32, 3.12 + Math.sin(ang) * 0.145);
      perna.rotation.set(Math.sin(ang) * 0.08, 0, -Math.cos(ang) * 0.08);
    }
  }
  // fruteira
  const fruteira = m.malha(new THREE.SphereGeometry(0.17, 36, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 'ceramica', ilha);
  fruteira.scale.set(1, 0.42, 1);
  fruteira.position.set(2.45, BASE.y1 + TAMPO + 0.072, 2.3);
  for (const [dx, dz, mat] of [[-0.05, 0.02, 'fruta'], [0.05, -0.03, 'limao'], [0.02, 0.06, 'fruta'], [-0.03, -0.06, 'limao']] as const) {
    const f = m.malha(new THREE.SphereGeometry(0.04, 20, 14), mat, ilha);
    f.position.set(2.45 + dx, BASE.y1 + TAMPO + 0.06, 2.3 + dz);
  }
  // pendentes
  for (const x of [1.86, 2.54]) {
    const cupula = m.malha(new THREE.CylinderGeometry(0.07, 0.15, 0.2, 40, 1, true), 'pretoFosco', ilha);
    (cupula.geometry as THREE.CylinderGeometry).computeVertexNormals();
    cupula.position.set(x, 1.86, 2.3);
    const fio = m.malha(new THREE.CylinderGeometry(0.0025, 0.0025, H - 1.96, 6), 'pretoFosco', ilha, false);
    fio.position.set(x, 1.96 + (H - 1.96) / 2, 2.3);
    const difusor = new THREE.Mesh(new THREE.CircleGeometry(0.14, 40), materiais.fixos.luminaria);
    geometriasAvulsas.push(difusor.geometry);
    difusor.rotation.x = Math.PI / 2;
    difusor.position.set(x, 1.765, 2.3);
    ilha.add(difusor);
    luzes.pendentes.visuais.push(difusor);
    const luz = new THREE.PointLight('#ffd1a3', 1, 5, 2);
    luz.position.set(x, 1.72, 2.3);
    addLuz('pendentes', luz, 2.2, ilha);
    halo('pendentes', 0.9, 0.9, [x, BASE.y1 + TAMPO + 0.003, 2.3], [-Math.PI / 2, 0, 0], radial, 0.45, ilha);
  }

  /* ---------- spots do teto ---------- */
  const spots: V3[] = [
    [1.0, H - 0.01, 1.15],
    [2.25, H - 0.01, 1.15],
    [3.5, H - 0.01, 1.15],
    [2.25, H - 0.01, 3.35],
  ];
  for (const [x, y, z] of spots) {
    const aro = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.004, 28), materiais.fixos.pretoFosco);
    const disco = new THREE.Mesh(new THREE.CircleGeometry(0.035, 28), materiais.fixos.spot);
    geometriasAvulsas.push(aro.geometry, disco.geometry);
    aro.position.set(x, y, z);
    disco.rotation.x = Math.PI / 2;
    disco.position.set(x, y - 0.003, z);
    teto.add(aro, disco);
    luzes.spots.visuais.push(disco);
    if (!leve || z < 2) {
      const luz = new THREE.SpotLight('#ffd1a3', 1, 6, 0.62, 0.85, 2);
      luz.position.set(x, y - 0.02, z);
      luz.target.position.set(x, 0, z);
      raiz.add(luz.target);
      addLuz('spots', luz, 9, raiz);
    }
  }

  /* ---------- sol e luz da janela ---------- */
  const sol = new THREE.DirectionalLight('#fff1dd', 3);
  sol.position.set(-6, 4.2, 2.3);
  sol.target.position.set(2.4, 0, 2.3);
  raiz.add(sol, sol.target);
  sol.castShadow = true;
  const resolucao = leve ? 1024 : 2048;
  sol.shadow.mapSize.set(resolucao, resolucao);
  Object.assign(sol.shadow.camera, { left: -4.2, right: 4.2, top: 3.6, bottom: -3.6, near: 0.5, far: 18 });
  sol.shadow.camera.updateProjectionMatrix();
  sol.shadow.bias = -0.0004;
  sol.shadow.normalBias = 0.02;
  sol.shadow.radius = 3;
  let janela: THREE.RectAreaLight | null = null;
  if (!leve) {
    prepararLuzesDeArea();
    janela = new THREE.RectAreaLight('#eef4ff', 4, JANELA.z1 - JANELA.z0 - 0.1, JANELA.y1 - JANELA.y0 - 0.1);
    janela.position.set(0.02, (JANELA.y0 + JANELA.y1) / 2, (JANELA.z0 + JANELA.z1) / 2);
    janela.lookAt(3, (JANELA.y0 + JANELA.y1) / 2, (JANELA.z0 + JANELA.z1) / 2);
    raiz.add(janela);
  }

  /* ---------- fusão das peças estáticas (menos chamadas de desenho) ---------- */
  m.mesclar(principal);
  m.mesclar(ilha);
  m.mesclar(nicho);
  m.mesclar(fechados);
  paredes.forEach((p) => m.mesclar(p.grupo));

  const emissivos = [materiais.fixos.led, materiais.fixos.luminaria, materiais.fixos.spot, ...materiaisHalo];

  return {
    montagem: m,
    vistas: {
      inicial: { pos: [6.0, 2.35, 6.1], alvo: [2.1, 1.0, 1.35] },
      frente: { pos: [2.3, 1.5, 5.7], alvo: [2.3, 1.2, 0.8] },
      lateral: { pos: [7.4, 1.75, 2.0], alvo: [2.3, 1.05, 1.6] },
      superior: { pos: [2.3, 8.8, 2.27], alvo: [2.3, 0, 2.2] },
      ilha: { pos: [4.15, 1.6, 4.3], alvo: [2.25, 0.85, 2.15] },
      ampla: { pos: [9.2, 5.7, 9.2], alvo: [2.3, 0.9, 1.9] },
    },
    limitesAlvo: { min: [0.3, 0.2, 0.3], max: [4.3, 2.0, 3.8] },
    distancia: [0.9, 13],
    sol: { luz: sol, dia: [-6, 4.2, 2.3], tarde: [-6, 2.3, 3.4] },
    sombras,
    janela,
    exterior: materiais.fixos.exterior,
    luzes,
    emissivos,
    aplicarComposicao(c) {
      ilha.visible = c.composicao.ilha;
      nicho.visible = c.composicao.aereos === 'nicho';
      fechados.visible = !nicho.visible;
      saias.forEach((s) => (s.visible = c.bancada.espessura === 'encorpada'));
      // com a ilha escondida, as luzes dela também saem da conta
      luzes.pendentes.luzes.forEach((l) => (l.visible = ilha.visible && c.iluminacao.acesas.pendentes));
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
      m.dispose();
      texturas.forEach((t) => t.dispose());
      geometriasAvulsas.forEach((g) => g.dispose());
      materiaisHalo.forEach((mat) => mat.dispose());
      materialSombra.dispose();
    },
  };
};
