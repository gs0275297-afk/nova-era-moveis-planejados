// Dados comerciais da Nova Era. Só entra o que foi confirmado:
// - nome, endereço e telefone: informados pela empresa (29/10/2026);
// - telefone e frase da bio: perfil oficial no Instagram (29/10/2026);
// - WhatsApp no mesmo número: link "Fale Conosco" do Linktree oficial (linktr.ee/novaeramarcenaria),
//   que aparece na bio do Instagram.
// Não acrescente horário, ano de fundação, avaliações, prazos, garantias ou materiais sem confirmação.

const numero = '556735213875';

export const empresa = {
  nome: 'Nova Era Móveis Planejados',
  nomeCurto: 'Nova Era',
  // Frase da bio oficial no Instagram.
  frase: 'Fabricamos soluções inteligentes que otimizam seu espaço.',
  cidade: 'Três Lagoas',
  uf: 'MS',
  endereco: {
    rua: 'Rua João Carrato, 1650',
    bairro: 'Centro',
    cidade: 'Três Lagoas',
    uf: 'MS',
    cep: '79601-011',
  },
  telefone: {
    exibicao: '(67) 3521-3875',
    link: 'tel:+556735213875',
    internacional: '+55 67 3521-3875',
  },
  whatsapp: {
    numero,
    link: (mensagem?: string) => `https://wa.me/${numero}${mensagem ? `?text=${encodeURIComponent(mensagem)}` : ''}`,
  },
  instagram: {
    usuario: '@novaera_planejados',
    link: 'https://www.instagram.com/novaera_planejados/',
  },
} as const;

export const enderecoCompleto = `${empresa.endereco.rua} – ${empresa.endereco.bairro}, ${empresa.endereco.cidade} – ${empresa.endereco.uf}, ${empresa.endereco.cep}`;

const consultaMapa = encodeURIComponent(`${empresa.endereco.rua}, ${empresa.endereco.cidade} - ${empresa.endereco.uf}, ${empresa.endereco.cep}`);
export const mapa = {
  abrir: `https://www.google.com/maps/search/?api=1&query=${consultaMapa}`,
  rota: `https://www.google.com/maps/dir/?api=1&destination=${consultaMapa}`,
  embed: `https://www.google.com/maps?q=${consultaMapa}&output=embed`,
};

export const mensagemPadrao = 'Olá! Conheci o site da Nova Era Móveis Planejados e gostaria de solicitar um orçamento.';

export const navegacao = [
  { href: '#projetos', rotulo: 'Projetos' },
  { href: '#detalhes', rotulo: 'Detalhes' },
  { href: '#simulador', rotulo: 'Simulador 3D' },
];
