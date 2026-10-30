import type * as THREE from 'three';
import type { Luz, Vista } from '../catalogo';
import type { Config } from '../estado';
import type { Materiais } from '../materiais';
import type { Articulacao, Montagem, V3 } from '../moveis';

/** Grupo de luz leve: "janela" e "rebote" seguem o cenário; os demais seguem os interruptores. */
export type GrupoLuzLeve = Luz | 'janela' | 'rebote';

/** Luz pontual calculada no shader da sala (sem custo de recompilação ao ligar e desligar). */
export interface LuzPonto {
  grupo: GrupoLuzLeve;
  pos: V3;
  /** eixo do cone; sem ele, a luz vai para todos os lados */
  dir?: V3;
  /** cosseno da abertura do cone */
  cone?: number;
  alcance: number;
  intensidade: number;
}

/** Fita de LED: a luz vem do ponto mais próximo do segmento. */
export interface LuzLinha {
  grupo: GrupoLuzLeve;
  a: V3;
  b: V3;
  dir: V3;
  alcance: number;
  intensidade: number;
}

/**
 * Contrato de um ambiente do simulador. Cada ambiente é um módulo em ./ambientes/ que monta
 * sua própria geometria, luzes e vistas; o motor não sabe nada de cozinha, closet etc.
 */
export interface AmbienteMontado {
  montagem: Montagem;
  vistas: Record<Vista, { pos: V3; alvo: V3 }>;
  /** caixa onde o ponto de mira da câmera pode ficar (evita "sair" do ambiente) */
  limitesAlvo: { min: V3; max: V3 };
  distancia: [number, number];
  /** caixa da sala e posição da sonda de reflexo */
  sala: { min: V3; max: V3; sonda: V3 };
  sol: { luz: THREE.DirectionalLight; dia: V3; tarde: V3 };
  /** peças que só existem para bloquear o sol: visíveis apenas no quadro que recalcula a sombra */
  sombras: THREE.Object3D;
  exterior: THREE.MeshBasicMaterial;
  pontos: LuzPonto[];
  linhas: LuzLinha[];
  /** peças que brilham: só aparecem com a luz do grupo acesa */
  visuais: Record<Luz, THREE.Object3D[]>;
  /** materiais emissivos que seguem a cor da luz artificial, com a força de cada um */
  emissivos: { material: THREE.MeshBasicMaterial; forca: number }[];
  aplicarComposicao(c: Config): void;
  /** esconde as paredes entre a câmera e o ambiente (maquete em corte). Devolve true se mudou. */
  atualizarCortes(camera: THREE.Vector3): boolean;
  /** mostra a sala inteira (a sonda de reflexo precisa ver todas as paredes) */
  salaInteira(ativa: boolean): void;
  /** caixas que a câmera não pode invadir */
  zonas(): { min: V3; max: V3 }[];
  articulacoesVisiveis(): Articulacao[];
  dispose(): void;
}

export type MontarAmbiente = (ctx: {
  materiais: Materiais;
  leve: boolean;
  materialDe: (papel: string) => THREE.Material;
}) => AmbienteMontado;
