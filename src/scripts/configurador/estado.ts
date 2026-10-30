import {
  acabamento,
  brilhos,
  cenarios,
  cores,
  idLaca,
  lerLaca,
  luzes,
  madeiras,
  metais,
  papeis,
  pedras,
  puxadores,
  temperaturas,
  type Cenario,
  type IdAmbiente,
  type Luz,
  type MetalPuxador,
  type Papel,
  type TemperaturaLuz,
  type TipoPuxador,
} from './catalogo';

/** Uma configuração completa do simulador. Portas abertas não fazem parte: são só exploração. */
export interface Config {
  ambiente: IdAmbiente;
  composicao: { ilha: boolean; aereos: 'nicho' | 'fechados' };
  acabamentos: Record<Papel, string>;
  bancada: { pedra: string; espessura: 'fina' | 'encorpada' };
  puxador: { tipo: TipoPuxador; metal: MetalPuxador };
  iluminacao: { cenario: Cenario; temperatura: TemperaturaLuz; acesas: Record<Luz, boolean> };
}

export const PADRAO: Config = {
  ambiente: 'cozinha',
  composicao: { ilha: true, aereos: 'nicho' },
  acabamentos: {
    portas: idLaca('off', 'fosco'),
    gavetas: idLaca('off', 'fosco'),
    estrutura: idLaca('branco', 'fosco'),
    paineis: 'freijo',
    prateleiras: 'freijo',
  },
  bancada: { pedra: 'marmore', espessura: 'fina' },
  puxador: { tipo: 'perfil', metal: 'aluminio' },
  iluminacao: { cenario: 'dia', temperatura: 'quente', acesas: { led: true, nichos: true, pendentes: false, spots: false } },
};

export const clonar = (c: Config): Config => structuredClone(c);

/* ---------- validação (links e sessões podem trazer qualquer coisa) ---------- */
const acabamentoValido = (id: unknown) => {
  if (typeof id !== 'string') return false;
  const laca = lerLaca(id);
  if (laca) return cores.some((c) => c.id === laca.cor) && brilhos.some((b) => b.id === laca.brilho);
  return madeiras.some((m) => m.id === id);
};
const um = <T extends string>(v: unknown, lista: readonly { id: T }[], padrao: T): T =>
  lista.some((x) => x.id === v) ? (v as T) : padrao;

export function validar(bruto: unknown): Config {
  const b = (bruto ?? {}) as Partial<Config>;
  const c = clonar(PADRAO);
  if (b.composicao) {
    c.composicao.ilha = b.composicao.ilha !== false;
    c.composicao.aereos = b.composicao.aereos === 'fechados' ? 'fechados' : 'nicho';
  }
  for (const p of papeis) {
    const v = b.acabamentos?.[p.id];
    if (acabamentoValido(v)) c.acabamentos[p.id] = v as string;
  }
  if (b.bancada) {
    c.bancada.pedra = um(b.bancada.pedra, pedras, PADRAO.bancada.pedra);
    c.bancada.espessura = b.bancada.espessura === 'encorpada' ? 'encorpada' : 'fina';
  }
  if (b.puxador) {
    c.puxador.tipo = um(b.puxador.tipo, puxadores, PADRAO.puxador.tipo);
    c.puxador.metal = um(b.puxador.metal, metais, PADRAO.puxador.metal);
  }
  if (b.iluminacao) {
    c.iluminacao.cenario = um(b.iluminacao.cenario, cenarios, PADRAO.iluminacao.cenario);
    c.iluminacao.temperatura = um(b.iluminacao.temperatura, temperaturas, PADRAO.iluminacao.temperatura);
    for (const l of luzes) {
      const v = b.iluminacao.acesas?.[l.id];
      if (typeof v === 'boolean') c.iluminacao.acesas[l.id] = v;
    }
  }
  return c;
}

/* ---------- link compartilhável: a configuração vai no próprio endereço (#simulador=...) ---------- */
const CHAVE_LINK = 'simulador';

/** Só o que difere do padrão (o link fica curto; validar() completa o resto ao abrir). */
function diferencas(a: Record<string, unknown>, padrao: Record<string, unknown>): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a)) {
    const base = padrao[k];
    if (v && typeof v === 'object' && base && typeof base === 'object') {
      const sub = diferencas(v as Record<string, unknown>, base as Record<string, unknown>);
      if (Object.keys(sub).length) saida[k] = sub;
    } else if (v !== base) saida[k] = v;
  }
  return saida;
}

export function codificar(c: Config): string {
  const json = JSON.stringify(diferencas(c as unknown as Record<string, unknown>, PADRAO as unknown as Record<string, unknown>));
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodificar(texto: string): Config | null {
  try {
    const b64 = texto.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const json = new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
    return validar(JSON.parse(json));
  } catch {
    return null;
  }
}

export const linkDe = (c: Config) => `${location.origin}${location.pathname}#${CHAVE_LINK}=${codificar(c)}`;

export function configDoEndereco(): Config | null {
  const m = location.hash.match(new RegExp(`#${CHAVE_LINK}=([A-Za-z0-9_-]+)`));
  return m ? decodificar(m[1]) : null;
}

/* ---------- configurações salvas na sessão (sessionStorage: some ao fechar o navegador) ---------- */
export interface Salva {
  id: string;
  nome: string;
  quando: number;
  config: Config;
}
const CHAVE_SESSAO = 'novaera-simulador-salvas';

export function lerSalvas(): Salva[] {
  try {
    const lista = JSON.parse(sessionStorage.getItem(CHAVE_SESSAO) ?? '[]') as Salva[];
    return Array.isArray(lista) ? lista.map((s) => ({ ...s, config: validar(s.config) })) : [];
  } catch {
    return [];
  }
}

function gravarSalvas(lista: Salva[]) {
  try {
    sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(lista));
    return true;
  } catch {
    return false;
  }
}

export function salvar(config: Config): Salva | null {
  const lista = lerSalvas();
  const numero = lista.reduce((n, s) => Math.max(n, Number(s.nome.match(/\d+$/)?.[0] ?? 0)), 0) + 1;
  const nova: Salva = { id: crypto.randomUUID(), nome: `Configuração ${numero}`, quando: Date.now(), config: clonar(config) };
  return gravarSalvas([nova, ...lista].slice(0, 12)) ? nova : null;
}

export function excluirSalva(id: string) {
  gravarSalvas(lerSalvas().filter((s) => s.id !== id));
}

/* ---------- loja com histórico (desfazer) ---------- */
export type Ouvinte = (atual: Config, anterior: Config) => void;

export function criarLoja(inicial: Config) {
  let atual = clonar(inicial);
  const historico: Config[] = [];
  const ouvintes = new Set<Ouvinte>();

  const emitir = (anterior: Config) => ouvintes.forEach((o) => o(atual, anterior));

  return {
    get: () => atual,
    podeDesfazer: () => historico.length > 0,
    /** Aplica uma mudança e guarda o estado anterior para "desfazer". */
    mudar(fn: (c: Config) => void) {
      const anterior = clonar(atual);
      const proximo = clonar(atual);
      fn(proximo);
      if (JSON.stringify(proximo) === JSON.stringify(anterior)) return;
      historico.push(anterior);
      if (historico.length > 60) historico.shift();
      atual = proximo;
      emitir(anterior);
    },
    /** Substitui tudo (restaurar, carregar salva ou link): também pode ser desfeito. */
    definir(c: Config) {
      this.mudar((x) => Object.assign(x, clonar(c)));
    },
    desfazer() {
      const anterior = historico.pop();
      if (!anterior) return;
      const antes = atual;
      atual = anterior;
      emitir(antes);
    },
    ouvir(o: Ouvinte) {
      ouvintes.add(o);
      return () => ouvintes.delete(o);
    },
  };
}
export type Loja = ReturnType<typeof criarLoja>;

/* ---------- resumo legível (painel, orçamento e WhatsApp) ---------- */
export interface LinhaResumo {
  rotulo: string;
  valor: string;
  alterado: boolean;
}

export function resumo(c: Config): LinhaResumo[] {
  const linhas: LinhaResumo[] = [];
  const add = (rotulo: string, valor: string, alterado: boolean) => linhas.push({ rotulo, valor, alterado });
  add('Ambiente', 'Cozinha planejada (simulação ilustrativa)', false);
  add('Composição', c.composicao.ilha ? 'Com ilha e banquetas' : 'Sem ilha', c.composicao.ilha !== PADRAO.composicao.ilha);
  add(
    'Armários superiores',
    c.composicao.aereos === 'nicho' ? 'Com nicho aberto iluminado' : 'Todos fechados',
    c.composicao.aereos !== PADRAO.composicao.aereos,
  );
  for (const p of papeis) {
    add(p.nome, acabamento(c.acabamentos[p.id]).nome, c.acabamentos[p.id] !== PADRAO.acabamentos[p.id]);
  }
  add('Bancada', acabamento(c.bancada.pedra).nome, c.bancada.pedra !== PADRAO.bancada.pedra);
  add('Espessura aparente da bancada', c.bancada.espessura === 'fina' ? 'Fina' : 'Encorpada', c.bancada.espessura !== PADRAO.bancada.espessura);
  const tipo = puxadores.find((x) => x.id === c.puxador.tipo)!;
  const metal = metais.find((x) => x.id === c.puxador.metal)!;
  add('Puxadores', c.puxador.tipo === 'toque' ? tipo.nome : `${tipo.nome}, ${metal.nome.toLowerCase()}`, c.puxador.tipo !== PADRAO.puxador.tipo || c.puxador.metal !== PADRAO.puxador.metal);
  const cen = cenarios.find((x) => x.id === c.iluminacao.cenario)!;
  add('Iluminação', cen.nome, c.iluminacao.cenario !== PADRAO.iluminacao.cenario);
  const acesas = luzes.filter((l) => c.iluminacao.acesas[l.id]).map((l) => l.nome);
  add(
    'Luzes acesas',
    acesas.length ? acesas.join(', ') : 'nenhuma',
    luzes.some((l) => c.iluminacao.acesas[l.id] !== PADRAO.iluminacao.acesas[l.id]),
  );
  add(
    'Cor da luz artificial',
    temperaturas.find((x) => x.id === c.iluminacao.temperatura)!.nome,
    c.iluminacao.temperatura !== PADRAO.iluminacao.temperatura,
  );
  return linhas;
}
