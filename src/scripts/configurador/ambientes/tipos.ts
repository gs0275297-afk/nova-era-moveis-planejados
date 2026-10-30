import type * as THREE from 'three';
import type { Luz, Vista } from '../catalogo';
import type { Config } from '../estado';
import type { Materiais } from '../materiais';
import type { Articulacao, Montagem, V3 } from '../moveis';

/** Luzes de um grupo ("LED sob os armários", "Pendentes"...): fontes reais + peças que brilham. */
export interface GrupoLuz {
  luzes: THREE.Light[];
  intensidades: number[];
  /** peças emissivas e halos: só aparecem com a luz acesa */
  visuais: THREE.Object3D[];
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
  sol: { luz: THREE.DirectionalLight; dia: V3; tarde: V3 };
  /** peças que só existem para bloquear o sol: visíveis apenas no quadro que recalcula a sombra */
  sombras: THREE.Object3D;
  janela: THREE.RectAreaLight | null;
  exterior: THREE.MeshBasicMaterial;
  luzes: Record<Luz, GrupoLuz>;
  /** materiais emissivos que seguem a cor da luz artificial (quente/neutra) */
  emissivos: THREE.MeshBasicMaterial[];
  aplicarComposicao(c: Config): void;
  /** esconde as paredes entre a câmera e o ambiente (maquete em corte). Devolve true se mudou. */
  atualizarCortes(camera: THREE.Vector3): boolean;
  articulacoesVisiveis(): Articulacao[];
  dispose(): void;
}

export type MontarAmbiente = (ctx: {
  materiais: Materiais;
  leve: boolean;
  materialDe: (papel: string) => THREE.Material;
}) => AmbienteMontado;
