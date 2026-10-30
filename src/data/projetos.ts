import type { ImageMetadata } from 'astro';

import aberturaAmpliada from '../assets/fotos/abertura-ampliada.jpg';
import jantarAdegaAmpla from '../assets/fotos/jantar-adega-ampla.jpg';
import panoramaPainel from '../assets/fotos/panorama-painel.jpg';
import cozinhaUInox from '../assets/fotos/cozinha-u-inox.jpg';
import livingPeDireitoDuplo from '../assets/fotos/living-pe-direito-duplo.jpg';
import aparadorCurvo from '../assets/fotos/aparador-curvo.jpg';
import jantarAdega from '../assets/fotos/jantar-adega.jpg';
import adegaNichosLed from '../assets/fotos/adega-nichos-led.jpg';
import cozinhaAreiaCoifa from '../assets/fotos/cozinha-areia-coifa.jpg';
import cozinhaAreiaNicho from '../assets/fotos/cozinha-areia-nicho.jpg';
import cozinhaArmarioVidro from '../assets/fotos/cozinha-armario-vidro.jpg';
import cozinhaAereosMadeira from '../assets/fotos/cozinha-aereos-madeira.jpg';
import cozinhaGourmetIntegrada from '../assets/fotos/cozinha-gourmet-integrada.jpg';
import cozinhaIlhaLed from '../assets/fotos/cozinha-ilha-led.jpg';
import salaPainelMarmore from '../assets/fotos/sala-painel-marmore.jpg';
import salaIntegradaEscada from '../assets/fotos/sala-integrada-escada.jpg';
import salaPainelMadeira from '../assets/fotos/sala-painel-madeira.jpg';
import salaRackPrateleiras from '../assets/fotos/sala-rack-prateleiras.jpg';
import livingAparadorQuadro from '../assets/fotos/living-aparador-quadro.jpg';
import barPrateleirasLed from '../assets/fotos/bar-prateleiras-led.jpg';
import barNichosIluminados from '../assets/fotos/bar-nichos-iluminados.jpg';
import dormitorioCabeceiraEstofada from '../assets/fotos/dormitorio-cabeceira-estofada.jpg';
import dormitorioCabeceiraPainel from '../assets/fotos/dormitorio-cabeceira-painel.jpg';
import dormitorioArmarioTv from '../assets/fotos/dormitorio-armario-tv.jpg';
import dormitorioPainelTv from '../assets/fotos/dormitorio-painel-tv.jpg';
import dormitorioEscrivaninha from '../assets/fotos/dormitorio-escrivaninha.jpg';
import banheiroBancadaEspelheira from '../assets/fotos/banheiro-bancada-espelheira.jpg';
import hallRipadoEspelho from '../assets/fotos/hall-ripado-espelho.jpg';
import detalhePrateleirasLed from '../assets/fotos/detalhe-prateleiras-led.jpg';
import detalheRipadoPainel from '../assets/fotos/detalhe-ripado-painel.jpg';
import detalheEspelhosCabeceira from '../assets/fotos/detalhe-espelhos-cabeceira.jpg';

// Todas as fotos são de ambientes reais do portfólio da Nova Era (material enviado pela empresa,
// com a marca d'água original). As descrições dizem só o que aparece na foto.

export interface Foto {
  src: ImageMetadata;
  alt: string;
  legenda: string;
  /** object-position do recorte nas miniaturas */
  foco?: string;
}

export const abertura: Foto = {
  src: aberturaAmpliada,
  alt: 'Sala de jantar com paredes em painéis ripados de madeira, forro amadeirado com linhas de luz e mesa para oito lugares',
  legenda: 'Sala de jantar com painéis ripados e iluminação linear',
  foco: '50% 40%',
};

export interface Projeto {
  id: string;
  titulo: string;
  ambiente: string;
  destaques: string[];
  fotos: [Foto, Foto];
  /** recorte de borda a borda da primeira foto, quando o capítulo usa tela cheia */
  ampla?: ImageMetadata;
}

// Projetos em destaque: pares de fotos do mesmo espaço.
export const projetos: Projeto[] = [
  {
    id: 'living',
    titulo: 'Living de pé-direito duplo',
    ambiente: 'Sala de estar',
    destaques: ['Aparador suspenso em madeira', 'Canto arredondado no acabamento da peça'],
    fotos: [
      {
        src: livingPeDireitoDuplo,
        alt: 'Living de pé-direito duplo com cortinas altas, sofá capitonê caramelo e aparador suspenso em madeira junto à parede clara',
        legenda: 'Vista geral do living',
        foco: '50% 55%',
      },
      {
        src: aparadorCurvo,
        alt: 'Aparador suspenso em madeira com canto arredondado, sob um quadro, com dois vasos prateados',
        legenda: 'Aparador suspenso com canto arredondado',
        foco: '60% 62%',
      },
    ],
  },
  {
    id: 'jantar',
    titulo: 'Sala de jantar com adega',
    ambiente: 'Jantar e adega',
    destaques: ['Paredes em painéis ripados', 'Nichos e prateleiras iluminados', 'Adega integrada ao ambiente'],
    ampla: jantarAdegaAmpla,
    fotos: [
      {
        src: jantarAdega,
        alt: 'Sala de jantar com mesa clara, cadeiras cinza, painéis ripados de madeira e móvel com nichos iluminados ao fundo',
        legenda: 'Mesa de jantar e parede de nichos',
        foco: '50% 48%',
      },
      {
        src: adegaNichosLed,
        alt: 'Móvel em madeira com nichos iluminados, prateleiras com garrafas e adega climatizada embutida',
        legenda: 'Nichos com iluminação e adega embutida',
        foco: '55% 40%',
      },
    ],
  },
  {
    id: 'cozinha',
    titulo: 'Cozinha em tons de areia',
    ambiente: 'Cozinha',
    destaques: ['Armários lisos em tom areia', 'Puxadores integrados às frentes', 'Iluminação sob os armários superiores'],
    fotos: [
      {
        src: cozinhaAreiaCoifa,
        alt: 'Cozinha com armários lisos em tom areia, coifa embutida entre os armários superiores e bancada de pedra clara',
        legenda: 'Armários superiores e coifa embutida',
        foco: '45% 50%',
      },
      {
        src: cozinhaAreiaNicho,
        alt: 'Bancada de cozinha com cuba, armários em tom areia, iluminação sob os superiores e nicho escuro com vasos',
        legenda: 'Bancada da pia e nicho superior',
        foco: '50% 45%',
      },
    ],
  },
];

export type Categoria = 'cozinhas' | 'salas' | 'bar' | 'dormitorios' | 'banho-hall';

export const categorias: { id: Categoria; nome: string }[] = [
  { id: 'cozinhas', nome: 'Cozinhas' },
  { id: 'salas', nome: 'Salas e painéis' },
  { id: 'dormitorios', nome: 'Dormitórios e closets' },
  { id: 'bar', nome: 'Bar e gourmet' },
  { id: 'banho-hall', nome: 'Banheiro e hall' },
];

export interface FotoGaleria extends Foto {
  categoria: Categoria;
}

// Galeria por ambiente (fotos que não estão nos projetos em destaque).
export const galeria: FotoGaleria[] = [
  {
    categoria: 'cozinhas',
    src: cozinhaArmarioVidro,
    alt: 'Cozinha com torre de armários de portas de vidro escuro, painel em madeira e bancada com cooktop',
    legenda: 'Torre de armários com portas de vidro',
    foco: '50% 40%',
  },
  {
    categoria: 'cozinhas',
    src: cozinhaUInox,
    alt: 'Cozinha em U com armários lisos em tom areia até o teto, fogão, janela sobre a cuba, geladeira de inox e iluminação sob os superiores',
    legenda: 'Cozinha em U com armários até o teto',
    foco: '50% 45%',
  },
  {
    categoria: 'dormitorios',
    src: dormitorioCabeceiraPainel,
    alt: 'Dormitório com painel de cabeceira cinza, espelhos redondos com iluminação e guarda-roupa de portas lisas',
    legenda: 'Painel de cabeceira com espelhos iluminados',
    foco: '50% 55%',
  },
  {
    categoria: 'bar',
    src: barPrateleirasLed,
    alt: 'Bar com prateleiras iluminadas sobre parede escura e balcão inferior em madeira com iluminação no rodapé',
    legenda: 'Bar com prateleiras iluminadas',
    foco: '50% 35%',
  },
  {
    categoria: 'cozinhas',
    src: cozinhaAereosMadeira,
    alt: 'Cozinha com armários superiores em madeira, inferiores claros, forno embutido e revestimento preto',
    legenda: 'Armários superiores em madeira',
    foco: '55% 45%',
  },
  {
    categoria: 'salas',
    src: salaIntegradaEscada,
    alt: 'Sala integrada com paredes revestidas em painéis de madeira, prateleira alta, rack suspenso e escada caracol ao fundo',
    legenda: 'Sala com paredes em painéis de madeira',
    foco: '45% 50%',
  },
  {
    categoria: 'banho-hall',
    src: banheiroBancadaEspelheira,
    alt: 'Banheiro com bancada dupla, gabinete suspenso claro e espelheira com portas espelhadas',
    legenda: 'Gabinete suspenso e espelheira',
    foco: '45% 50%',
  },
  {
    categoria: 'dormitorios',
    src: dormitorioCabeceiraEstofada,
    alt: 'Dormitório com cabeceira estofada em gomos, painel marmorizado com frisos dourados e ripado nas laterais',
    legenda: 'Cabeceira estofada e painel marmorizado',
  },
  {
    categoria: 'cozinhas',
    src: cozinhaGourmetIntegrada,
    alt: 'Cozinha integrada com armários escuros, churrasqueira embutida, bancada com banquetas e TV na parede em madeira',
    legenda: 'Cozinha integrada ao estar',
    foco: '45% 45%',
  },
  {
    categoria: 'bar',
    src: barNichosIluminados,
    alt: 'Móvel de bar com nichos iluminados, prateleiras de vidro e adega embutida ao lado do painel de TV',
    legenda: 'Bar com nichos iluminados ao lado da TV',
    foco: '55% 45%',
  },
  {
    categoria: 'salas',
    src: salaRackPrateleiras,
    alt: 'Rack suspenso em madeira com prateleiras flutuantes e plantas sobre parede azul',
    legenda: 'Rack e prateleiras flutuantes',
    foco: '50% 50%',
  },
  {
    categoria: 'dormitorios',
    src: dormitorioArmarioTv,
    alt: 'Guarda-roupa de portas lisas com nicho para TV, gaveteiro e prateleiras laterais',
    legenda: 'Guarda-roupa com nicho para TV',
    foco: '55% 45%',
  },
  {
    categoria: 'banho-hall',
    src: hallRipadoEspelho,
    alt: 'Hall com parede ripada em madeira, espelho redondo com moldura de madeira e aparador suspenso com iluminação embaixo',
    legenda: 'Hall com ripado e espelho redondo',
    foco: '45% 50%',
  },
  {
    categoria: 'cozinhas',
    src: cozinhaIlhaLed,
    alt: 'Ilha de cozinha escura com cooktop, frente com frisos verticais e iluminação no rodapé',
    legenda: 'Ilha com iluminação no rodapé',
    foco: '50% 60%',
  },
  {
    categoria: 'salas',
    src: salaPainelMadeira,
    alt: 'Sala com paredes em painéis de madeira, prateleira superior, rack suspenso cinza e mesa de centro em madeira',
    legenda: 'Painel de madeira com rack suspenso',
    foco: '50% 45%',
  },
  {
    categoria: 'dormitorios',
    src: dormitorioPainelTv,
    alt: 'Dormitório com painel de TV marmorizado com frisos dourados, penteadeira e cômoda clara',
    legenda: 'Painel de TV e penteadeira no dormitório',
  },
  {
    categoria: 'salas',
    src: livingAparadorQuadro,
    alt: 'Aparador baixo em madeira com portas sob um quadro grande, em sala de parede clara com boiserie',
    legenda: 'Aparador em madeira na sala',
    foco: '50% 60%',
  },
  {
    categoria: 'dormitorios',
    src: dormitorioEscrivaninha,
    alt: 'Escrivaninha com estante de nichos, espelho com iluminação e gaveteiro em madeira e cinza',
    legenda: 'Escrivaninha com estante e espelho iluminado',
    foco: '45% 45%',
  },
];

// Foto de borda a borda entre a galeria e os detalhes.
export const panorama: Foto & { tela: ImageMetadata } = {
  src: salaPainelMarmore,
  tela: panoramaPainel,
  alt: 'Painel de TV em placas marmorizadas com frisos dourados, ripado nas laterais, rack suspenso claro e vaso com bambu',
  legenda: 'Painel de TV com ripado, placa marmorizada e frisos dourados',
};

// Índice de ambientes da apresentação: leva à galeria já filtrada.
export const previas: Record<Categoria, { src: ImageMetadata; alt: string }> = {
  cozinhas: { src: cozinhaUInox, alt: 'Cozinha em U com armários em tom areia' },
  salas: { src: salaIntegradaEscada, alt: 'Sala com paredes em painéis de madeira' },
  dormitorios: { src: dormitorioCabeceiraPainel, alt: 'Dormitório com painel de cabeceira e espelhos iluminados' },
  bar: { src: barPrateleirasLed, alt: 'Bar com prateleiras iluminadas' },
  'banho-hall': { src: hallRipadoEspelho, alt: 'Hall com parede ripada e espelho redondo' },
};

// Lista única do visualizador ampliado: projetos em destaque, panorama e, depois, a galeria.
export const fotosAmpliaveis = [
  ...projetos.flatMap((p) => p.fotos.map((foto) => ({ foto: foto as Foto, ambiente: p.titulo }))),
  { foto: panorama as Foto, ambiente: 'Salas e painéis' },
  ...galeria.map((foto) => ({ foto, ambiente: categorias.find((c) => c.id === foto.categoria)?.nome ?? '' })),
];
export const indiceDe = (foto: Foto) => fotosAmpliaveis.findIndex((item) => item.foto === foto);

export interface Detalhe {
  id: string;
  titulo: string;
  texto: string;
  midia: { tipo: 'foto'; foto: Omit<Foto, 'legenda'> } | { tipo: 'video'; arquivo: string; alt: string };
}

// Detalhes de execução: recortes de fotos reais e trechos curtos dos vídeos da empresa.
export const detalhes: Detalhe[] = [
  {
    id: 'iluminacao',
    titulo: 'Iluminação embutida',
    texto: 'Fitas de luz sob prateleiras e nichos destacam o que fica exposto e criam clima à noite.',
    midia: {
      tipo: 'foto',
      foto: {
        src: detalhePrateleirasLed,
        alt: 'Prateleiras com fita de luz embutida sobre parede escura, com garrafas e objetos decorativos',
      },
    },
  },
  {
    id: 'adega',
    titulo: 'Adega sob medida',
    texto: 'Suportes para garrafas sobre painel de madeira, com luz lateral contínua.',
    midia: { tipo: 'video', arquivo: 'detalhe-adega', alt: 'Parede de adega em madeira com garrafas presas em suportes e luz lateral' },
  },
  {
    id: 'cantos',
    titulo: 'Cantos arredondados',
    texto: 'O aparador suspenso termina em curva: um acabamento que suaviza o volume da peça.',
    midia: { tipo: 'video', arquivo: 'detalhe-aparador', alt: 'Câmera percorre um aparador suspenso em madeira com canto arredondado' },
  },
  {
    id: 'ripados',
    titulo: 'Ripados e painéis',
    texto: 'Ripas verticais, placas marmorizadas e frisos dourados compõem o painel da TV.',
    midia: {
      tipo: 'foto',
      foto: {
        src: detalheRipadoPainel,
        alt: 'Detalhe de painel com ripado vertical, placa marmorizada e friso dourado ao lado da TV',
      },
    },
  },
  {
    id: 'espelhos',
    titulo: 'Cabeceira com luz',
    texto: 'Painel de cabeceira com espelhos redondos iluminados dos dois lados da cama.',
    midia: {
      tipo: 'foto',
      foto: {
        src: detalheEspelhosCabeceira,
        alt: 'Painel de cabeceira cinza com dois espelhos redondos iluminados e cama com roupa de cama branca e azul',
      },
    },
  },
];
