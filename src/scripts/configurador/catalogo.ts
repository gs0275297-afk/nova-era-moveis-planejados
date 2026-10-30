/*
 * Catálogo do simulador 3D (sem three.js: a interface usa antes da cena carregar).
 * Tudo aqui é ilustrativo para explorar combinações: não é a linha de produtos, as marcas
 * nem as especificações da Nova Era. Nada de preço, medida garantida ou fornecedor.
 */

export type GrupoAcabamento = 'madeira' | 'laca' | 'pedra';

export interface Acabamento {
  id: string;
  nome: string;
  grupo: GrupoAcabamento;
  /** cor da amostra (e da superfície enquanto a textura carrega) */
  amostra: string;
  /** miniatura da amostra no painel (public/3d/amostras, gerada por scripts/preparar-amostras.py) */
  imagem?: string;
  /** madeiras: tom aplicado sobre a foto da lâmina (no 3D e na miniatura) */
  tom?: string;
}

const amostra = (nome: string) => `/3d/amostras/${nome}.webp`;

export const madeiras: Acabamento[] = [
  { id: 'carvalho', nome: 'Carvalho claro', grupo: 'madeira', amostra: '#cfae84', imagem: amostra('carvalho'), tom: '#fff4e6' },
  { id: 'freijo', nome: 'Freijó', grupo: 'madeira', amostra: '#b58456', imagem: amostra('freijo'), tom: '#ecdfd0' },
  { id: 'nogueira', nome: 'Nogueira', grupo: 'madeira', amostra: '#6a4530', imagem: amostra('nogueira'), tom: '#b47e58' },
  { id: 'nogueira-escura', nome: 'Madeira escura', grupo: 'madeira', amostra: '#3b281d', imagem: amostra('nogueira'), tom: '#6b4631' },
];

export const cores = [
  { id: 'branco', nome: 'Branco', hex: '#f1f0ec' },
  { id: 'off', nome: 'Off-white', hex: '#e8e2d6' },
  { id: 'areia', nome: 'Areia', hex: '#d2c6b2' },
  { id: 'cinza', nome: 'Cinza claro', hex: '#b9b9b5' },
  { id: 'grafite', nome: 'Grafite', hex: '#45464a' },
  { id: 'preto', nome: 'Preto', hex: '#1d1d1f' },
  { id: 'marinho', nome: 'Azul-marinho', hex: '#1f2a4d' },
  { id: 'salvia', nome: 'Verde sálvia', hex: '#8d9a86' },
] as const;

export type Brilho = 'fosco' | 'acetinado';
export const brilhos: { id: Brilho; nome: string }[] = [
  { id: 'fosco', nome: 'Fosco' },
  { id: 'acetinado', nome: 'Acetinado' },
];

/** Laca/MDF liso: id no formato "laca:<cor>:<brilho>". */
export const idLaca = (cor: string, brilho: Brilho) => `laca:${cor}:${brilho}`;
export const lerLaca = (id: string) => {
  const [, cor, brilho] = id.split(':');
  return id.startsWith('laca:') ? { cor, brilho: brilho as Brilho } : null;
};

export const pedras: Acabamento[] = [
  { id: 'marmore', nome: 'Mármore claro', grupo: 'pedra', amostra: '#e6e3dd', imagem: amostra('marmore') },
  { id: 'quartzo', nome: 'Quartzo branco', grupo: 'pedra', amostra: '#ecebe7', imagem: amostra('quartzo') },
  { id: 'granito', nome: 'Granito claro', grupo: 'pedra', amostra: '#d3cec4', imagem: amostra('granito') },
  { id: 'pedra-escura', nome: 'Pedra escura', grupo: 'pedra', amostra: '#2a2928', imagem: amostra('pedra-escura') },
];

export function acabamento(id: string): Acabamento {
  const laca = lerLaca(id);
  if (laca) {
    const c = cores.find((x) => x.id === laca.cor) ?? cores[0];
    const b = brilhos.find((x) => x.id === laca.brilho) ?? brilhos[0];
    return { id, nome: `${c.nome} ${b.nome.toLowerCase()}`, grupo: 'laca', amostra: c.hex };
  }
  return [...madeiras, ...pedras].find((a) => a.id === id) ?? madeiras[0];
}

/* ---------- componentes que recebem acabamento ---------- */
export type Papel = 'estrutura' | 'portas' | 'aereos' | 'gavetas' | 'paineis' | 'prateleiras';
export const papeis: { id: Papel; nome: string; dica: string }[] = [
  { id: 'portas', nome: 'Portas', dica: 'Portas de baixo, torre quente e geladeira' },
  { id: 'aereos', nome: 'Portas superiores', dica: 'Portas dos armários superiores' },
  { id: 'gavetas', nome: 'Gavetas', dica: 'Frentes das gavetas' },
  { id: 'estrutura', nome: 'Estrutura', dica: 'Caixas, laterais internas e rodapé' },
  { id: 'paineis', nome: 'Painéis', dica: 'Laterais aparentes, painel superior e ripado da ilha' },
  { id: 'prateleiras', nome: 'Nichos e prateleiras', dica: 'Nicho aberto e prateleiras aparentes' },
];

/* ---------- puxadores ---------- */
export type TipoPuxador = 'perfil' | 'barra' | 'botao' | 'toque';
export const puxadores: { id: TipoPuxador; nome: string; dica: string }[] = [
  { id: 'perfil', nome: 'Perfil', dica: 'Perfil contínuo na borda da frente' },
  { id: 'barra', nome: 'Barra', dica: 'Puxador de barra aparente' },
  { id: 'botao', nome: 'Botão', dica: 'Puxador pequeno, redondo' },
  { id: 'toque', nome: 'Sem puxador', dica: 'Abertura por toque: frentes lisas' },
];
export type MetalPuxador = 'aluminio' | 'inox' | 'preto' | 'dourado';
export const metais: { id: MetalPuxador; nome: string; hex: string }[] = [
  { id: 'aluminio', nome: 'Alumínio escovado', hex: '#b9bbbd' },
  { id: 'inox', nome: 'Inox polido', hex: '#dedfe0' },
  { id: 'preto', nome: 'Preto fosco', hex: '#232324' },
  { id: 'dourado', nome: 'Dourado escovado', hex: '#b8955a' },
];

/* ---------- iluminação ---------- */
export type Cenario = 'dia' | 'tarde' | 'neutra' | 'noite';
export const cenarios: { id: Cenario; nome: string; dica: string }[] = [
  { id: 'dia', nome: 'Luz do dia', dica: 'Sol entrando pela janela' },
  { id: 'tarde', nome: 'Fim de tarde', dica: 'Sol baixo e luz quente' },
  { id: 'neutra', nome: 'Neutra', dica: 'Dia nublado, luz difusa e branca' },
  { id: 'noite', nome: 'Noite', dica: 'Só a iluminação artificial' },
];
export type Luz = 'led' | 'nichos' | 'pendentes' | 'spots' | 'indireta';
export const luzes: { id: Luz; nome: string }[] = [
  { id: 'led', nome: 'Fita de LED sob os armários' },
  { id: 'nichos', nome: 'LED dos nichos' },
  { id: 'pendentes', nome: 'Pendentes da ilha' },
  { id: 'spots', nome: 'Spots embutidos' },
  { id: 'indireta', nome: 'Luz indireta da sanca' },
];
export type TemperaturaLuz = 'quente' | 'neutra';
export const temperaturas: { id: TemperaturaLuz; nome: string }[] = [
  { id: 'quente', nome: 'Quente (amarelada)' },
  { id: 'neutra', nome: 'Neutra (branca)' },
];

/* ---------- câmera ---------- */
export type Vista = 'inicial' | 'frente' | 'lateral' | 'superior' | 'ilha' | 'ampla';
export const vistas: { id: Vista; nome: string }[] = [
  { id: 'inicial', nome: 'Perspectiva' },
  { id: 'frente', nome: 'Frente' },
  { id: 'lateral', nome: 'Lateral' },
  { id: 'superior', nome: 'De cima' },
  { id: 'ilha', nome: 'Detalhe da ilha' },
  { id: 'ampla', nome: 'Visão ampla' },
];

/* ---------- ambientes ----------
 * Cada ambiente é um módulo próprio em ./ambientes/. Só entra na lista quando estiver pronto. */
export type IdAmbiente = 'cozinha';
export const ambientes: { id: IdAmbiente; nome: string; descricao: string }[] = [
  {
    id: 'cozinha',
    nome: 'Cozinha planejada',
    descricao: 'Bancada com torre quente, geladeira embutida, armários superiores e ilha com banquetas.',
  },
];
