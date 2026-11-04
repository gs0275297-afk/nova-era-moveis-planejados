import type { ImageMetadata } from 'astro';

import fotoAbertura from '../assets/fotos/abertura.jpg';
import jantarAmpla from '../assets/fotos/jantar-ampla.jpg';
import jantarAdega from '../assets/fotos/jantar-adega.jpg';
import cozinhaAreiaBancada from '../assets/fotos/cozinha-areia-bancada.jpg';
import cozinhaAreiaCoifa from '../assets/fotos/cozinha-areia-coifa.jpg';
import cozinhaUInox from '../assets/fotos/cozinha-u-inox.jpg';
import gourmetPrateleirasAmpla from '../assets/fotos/gourmet-prateleiras-ampla.jpg';
import gourmetCozinha from '../assets/fotos/gourmet-cozinha.jpg';
import gourmetBarTv from '../assets/fotos/gourmet-bar-tv.jpg';
import gourmetMovelBar from '../assets/fotos/gourmet-movel-bar.jpg';
import gourmetIlha from '../assets/fotos/gourmet-ilha.jpg';
import livingPeDireito from '../assets/fotos/living-pe-direito.jpg';
import livingAparadorCurvo from '../assets/fotos/living-aparador-curvo.jpg';
import livingSofaAparador from '../assets/fotos/living-sofa-aparador.jpg';
import dormitorioCabeceira from '../assets/fotos/dormitorio-cabeceira.jpg';
import dormitorioArmarioTv from '../assets/fotos/dormitorio-armario-tv.jpg';
import dormitorioMarmorizadoCabeceira from '../assets/fotos/dormitorio-marmorizado-cabeceira.jpg';
import dormitorioMarmorizadoTv from '../assets/fotos/dormitorio-marmorizado-tv.jpg';
import dormitorioEscrivaninha from '../assets/fotos/dormitorio-escrivaninha.jpg';
import salaMadeiraVista from '../assets/fotos/sala-madeira-vista.jpg';
import salaMadeiraPainel from '../assets/fotos/sala-madeira-painel.jpg';
import salaMadeiraMesa from '../assets/fotos/sala-madeira-mesa.jpg';
import cozinhaTorreVidro from '../assets/fotos/cozinha-torre-vidro.jpg';
import cozinhaAereosMadeira from '../assets/fotos/cozinha-aereos-madeira.jpg';
import salaPainelMarmorizado from '../assets/fotos/sala-painel-marmorizado.jpg';
import salaRackAzul from '../assets/fotos/sala-rack-azul.jpg';
import banheiroBancada from '../assets/fotos/banheiro-bancada.jpg';
import hallRipadoEspelho from '../assets/fotos/hall-ripado-espelho.jpg';
import detalheIluminacao from '../assets/fotos/detalhe-iluminacao.jpg';
import detalheRipado from '../assets/fotos/detalhe-ripado.jpg';
import detalheCabeceira from '../assets/fotos/detalhe-cabeceira.jpg';

// Todas as fotos são de ambientes reais do portfólio da Nova Era (material enviado pela empresa),
// tratadas por scripts/preparar-fotos.py. As descrições dizem só o que aparece na foto.
// Cada arquivo já está no enquadramento final: o site nunca recorta uma foto por CSS.

export interface Foto {
  src: ImageMetadata;
  alt: string;
  legenda: string;
}

export const abertura: Foto = {
  src: fotoAbertura,
  alt: 'Sala de jantar com paredes em painéis ripados de madeira, forro amadeirado com linhas de luz e mesa para oito lugares',
  legenda: 'Sala de jantar com painéis ripados e iluminação linear',
};

export type Categoria = 'cozinhas' | 'salas' | 'bar' | 'dormitorios' | 'banho-hall';

export const categorias: { id: Categoria; nome: string }[] = [
  { id: 'cozinhas', nome: 'Cozinhas' },
  { id: 'salas', nome: 'Salas e painéis' },
  { id: 'dormitorios', nome: 'Dormitórios e closets' },
  { id: 'bar', nome: 'Bar e gourmet' },
  { id: 'banho-hall', nome: 'Banheiro e hall' },
];

/**
 * Uma linha de fotos. As fotos da linha têm a mesma altura e, juntas, preenchem a largura:
 * - inteira: as 12 colunas da grade (sempre com duas fotos ou mais);
 * - direita / esquerda: 8 colunas, com 4 vazias do outro lado;
 * - estreita: 6 colunas à direita.
 * O título do projeto fica na linha marcada: acima dela (inteira) ou no espaço vazio ao lado.
 * Uma foto sozinha nunca passa de 8 colunas: os originais têm 1179 px, e mais largo que isso a foto
 * seria ampliada na tela.
 */
export interface Linha {
  largura: 'inteira' | 'direita' | 'esquerda' | 'estreita';
  titulo?: boolean;
  fotos: Foto[];
}

export interface Serie {
  id: string;
  titulo: string;
  categoria: Categoria;
  tom: 'claro' | 'escuro';
  linhas: Linha[];
}

// Cada série reúne as fotos de um mesmo ambiente. A ordem alterna ambientes escuros e claros.
export const series: Serie[] = [
  {
    id: 'jantar',
    titulo: 'Sala de jantar e adega',
    categoria: 'salas',
    tom: 'escuro',
    linhas: [
      {
        largura: 'esquerda',
        titulo: true,
        fotos: [
          {
            src: jantarAmpla,
            alt: 'Sala de jantar com forro de madeira e linhas de luz, painéis ripados, mesa clara com cadeiras cinza e parede de nichos iluminados',
            legenda: 'Forro em madeira, painéis ripados e nichos iluminados',
          },
        ],
      },
      {
        largura: 'direita',
        fotos: [
          {
            src: jantarAdega,
            alt: 'Móvel em madeira com nichos iluminados, prateleiras e adega embutida, atrás da mesa de jantar',
            legenda: 'Nichos iluminados e adega embutida',
          },
        ],
      },
    ],
  },
  {
    id: 'cozinha-areia',
    titulo: 'Cozinha em tons de areia',
    categoria: 'cozinhas',
    tom: 'claro',
    linhas: [
      {
        largura: 'direita',
        titulo: true,
        fotos: [
          {
            src: cozinhaAreiaBancada,
            alt: 'Bancada de cozinha com cuba, armários em tom areia, iluminação sob os superiores e nicho escuro com vasos',
            legenda: 'Bancada da pia e nicho superior',
          },
        ],
      },
      {
        largura: 'inteira',
        fotos: [
          {
            src: cozinhaAreiaCoifa,
            alt: 'Cozinha com armários lisos em tom areia, coifa embutida entre os armários superiores e bancada de pedra clara',
            legenda: 'Armários superiores e coifa embutida',
          },
          {
            src: cozinhaUInox,
            alt: 'Cozinha em U com armários lisos em tom areia até o teto, fogão, janela sobre a cuba, geladeira de inox e iluminação sob os superiores',
            legenda: 'Cozinha em U com armários até o teto',
          },
        ],
      },
    ],
  },
  {
    id: 'gourmet',
    titulo: 'Área gourmet integrada',
    categoria: 'bar',
    tom: 'escuro',
    linhas: [
      {
        largura: 'direita',
        titulo: true,
        fotos: [
          {
            src: gourmetPrateleirasAmpla,
            alt: 'Bar com prateleiras iluminadas sobre parede de pedra escura, ao lado de um painel de madeira',
            legenda: 'Prateleiras iluminadas sobre pedra escura',
          },
        ],
      },
      {
        largura: 'inteira',
        fotos: [
          {
            src: gourmetCozinha,
            alt: 'Cozinha integrada com armários escuros, churrasqueira embutida, bancada com banquetas e TV na parede em madeira',
            legenda: 'Cozinha integrada ao estar',
          },
          {
            src: gourmetBarTv,
            alt: 'Painel de madeira com TV, prateleiras iluminadas e móvel de bar suspenso com luz embaixo',
            legenda: 'Painel de TV e bar',
          },
        ],
      },
      {
        largura: 'inteira',
        fotos: [
          {
            src: gourmetMovelBar,
            alt: 'Móvel de bar em madeira sob três prateleiras iluminadas, com garrafas, vasos azuis e brancos e parede escura',
            legenda: 'Móvel de bar e prateleiras',
          },
          {
            src: gourmetIlha,
            alt: 'Ilha escura com cooktop, frente com frisos verticais e iluminação no rodapé',
            legenda: 'Ilha com iluminação no rodapé',
          },
        ],
      },
    ],
  },
  {
    id: 'living',
    titulo: 'Living de pé-direito duplo',
    categoria: 'salas',
    tom: 'claro',
    linhas: [
      {
        largura: 'inteira',
        titulo: true,
        fotos: [
          {
            src: livingPeDireito,
            alt: 'Living de pé-direito duplo com cortinas altas, sofá capitonê caramelo e aparador suspenso em madeira junto à parede clara',
            legenda: 'Vista geral do living',
          },
          {
            src: livingAparadorCurvo,
            alt: 'Ponta de um aparador suspenso em madeira com canto arredondado, com dois vasos prateados em cima',
            legenda: 'Aparador suspenso com canto arredondado',
          },
        ],
      },
      {
        largura: 'esquerda',
        fotos: [
          {
            src: livingSofaAparador,
            alt: 'Aparador suspenso em madeira sob um quadro grande, em parede clara com boiserie, com sofá caramelo em primeiro plano',
            legenda: 'Aparador sob o quadro',
          },
        ],
      },
    ],
  },
  {
    id: 'dormitorio-cabeceira',
    titulo: 'Dormitório com cabeceira iluminada',
    categoria: 'dormitorios',
    tom: 'claro',
    linhas: [
      {
        largura: 'inteira',
        titulo: true,
        fotos: [
          {
            src: dormitorioCabeceira,
            alt: 'Dormitório com painel de cabeceira, espelhos redondos com luz nos dois lados da cama e guarda-roupa de portas lisas',
            legenda: 'Painel de cabeceira com espelhos iluminados',
          },
          {
            src: dormitorioArmarioTv,
            alt: 'Guarda-roupa de portas lisas com nicho para TV, gaveteiro e prateleiras laterais',
            legenda: 'Guarda-roupa com nicho para TV',
          },
        ],
      },
    ],
  },
  {
    id: 'dormitorio-marmorizado',
    titulo: 'Dormitório com painel marmorizado',
    categoria: 'dormitorios',
    tom: 'claro',
    linhas: [
      {
        largura: 'esquerda',
        titulo: true,
        fotos: [
          {
            src: dormitorioMarmorizadoCabeceira,
            alt: 'Cabeceira estofada em gomos, painel marmorizado com frisos dourados e ripado nas laterais',
            legenda: 'Cabeceira estofada e painel marmorizado',
          },
        ],
      },
      {
        largura: 'direita',
        fotos: [
          {
            src: dormitorioMarmorizadoTv,
            alt: 'Painel de TV marmorizado com frisos dourados, cômoda com puxadores dourados e penteadeira clara',
            legenda: 'Painel de TV, cômoda e penteadeira',
          },
        ],
      },
    ],
  },
  {
    id: 'dormitorio-escrivaninha',
    titulo: 'Dormitório com escrivaninha',
    categoria: 'dormitorios',
    tom: 'claro',
    linhas: [
      {
        largura: 'estreita',
        titulo: true,
        fotos: [
          {
            src: dormitorioEscrivaninha,
            alt: 'Escrivaninha com estante de nichos, espelho com iluminação e gaveteiro em madeira e cinza',
            legenda: 'Escrivaninha com estante e espelho iluminado',
          },
        ],
      },
    ],
  },
  {
    id: 'sala-madeira',
    titulo: 'Sala revestida em madeira',
    categoria: 'salas',
    tom: 'escuro',
    linhas: [
      {
        largura: 'direita',
        titulo: true,
        fotos: [
          {
            src: salaMadeiraVista,
            alt: 'Sala integrada com paredes revestidas em painéis de madeira, prateleira alta, rack suspenso e escada caracol ao fundo',
            legenda: 'Painéis de madeira e rack suspenso',
          },
        ],
      },
      {
        largura: 'inteira',
        fotos: [
          {
            src: salaMadeiraPainel,
            alt: 'Painel de TV em madeira com ripado, prateleira superior e rack suspenso cinza',
            legenda: 'Painel de TV e prateleira',
          },
          {
            src: salaMadeiraMesa,
            alt: 'Mesa redonda de madeira com cadeiras e sofá, na mesma sala, com painel de madeira ao fundo',
            legenda: 'Mesa e estar',
          },
        ],
      },
    ],
  },
  {
    id: 'mais-cozinhas',
    titulo: 'Mais cozinhas',
    categoria: 'cozinhas',
    tom: 'claro',
    linhas: [
      {
        largura: 'inteira',
        titulo: true,
        fotos: [
          {
            src: cozinhaTorreVidro,
            alt: 'Cozinha com torre de armários de portas de vidro escuro, painel em madeira e bancada com cooktop',
            legenda: 'Torre de armários com portas de vidro',
          },
          {
            src: cozinhaAereosMadeira,
            alt: 'Cozinha com armários superiores em madeira, inferiores claros, forno embutido e revestimento preto',
            legenda: 'Armários superiores em madeira',
          },
        ],
      },
    ],
  },
  {
    id: 'mais-salas',
    titulo: 'Mais salas',
    categoria: 'salas',
    tom: 'claro',
    linhas: [
      {
        largura: 'inteira',
        titulo: true,
        fotos: [
          {
            src: salaPainelMarmorizado,
            alt: 'Painel de TV em placas marmorizadas com frisos dourados, ripado nas laterais, rack suspenso claro e vaso com bambu',
            legenda: 'Painel com ripado, placa marmorizada e frisos dourados',
          },
          {
            src: salaRackAzul,
            alt: 'Rack em madeira com prateleiras flutuantes e plantas sobre parede azul',
            legenda: 'Rack e prateleiras flutuantes',
          },
        ],
      },
    ],
  },
  {
    id: 'banheiro-hall',
    titulo: 'Banheiro e hall',
    categoria: 'banho-hall',
    tom: 'claro',
    linhas: [
      {
        largura: 'inteira',
        titulo: true,
        fotos: [
          {
            src: banheiroBancada,
            alt: 'Banheiro com bancada dupla, gabinete suspenso claro e espelheira com portas espelhadas',
            legenda: 'Gabinete suspenso e espelheira',
          },
          {
            src: hallRipadoEspelho,
            alt: 'Hall com parede ripada em madeira, espelho redondo com moldura de madeira e aparador suspenso com iluminação embaixo',
            legenda: 'Hall com ripado e espelho redondo',
          },
        ],
      },
    ],
  },
];

// Lista única do visualizador ampliado. Ele navega só entre as fotos da mesma série.
export const fotosAmpliaveis = series.flatMap((serie) =>
  serie.linhas.flatMap((linha) => linha.fotos.map((foto) => ({ foto, ambiente: serie.titulo }))),
);
export const indiceDe = (foto: Foto) => fotosAmpliaveis.findIndex((item) => item.foto === foto);

export interface Detalhe {
  id: string;
  titulo: string;
  midia: { tipo: 'foto'; src: ImageMetadata; alt: string } | { tipo: 'video'; arquivo: string; largura: number; altura: number; alt: string };
}

// Detalhes de execução: recortes de fotos reais (490 a 750 px) e trechos curtos dos vídeos da empresa
// (576 px). São mídias pequenas: as duas linhas têm a mesma altura e a segunda ocupa só 8 colunas,
// para nenhuma delas aparecer maior do que a própria resolução.
export const detalhes: Detalhe[][] = [
  [
    {
      id: 'iluminacao',
      titulo: 'Iluminação embutida',
      midia: { tipo: 'foto', src: detalheIluminacao, alt: 'Prateleiras com fita de luz embutida sobre parede escura, com garrafas e objetos decorativos' },
    },
    {
      id: 'ripados',
      titulo: 'Ripado e friso',
      midia: { tipo: 'foto', src: detalheRipado, alt: 'Ripado vertical ao lado de placa marmorizada com friso dourado' },
    },
    {
      id: 'cabeceira',
      titulo: 'Cabeceira com luz',
      midia: { tipo: 'foto', src: detalheCabeceira, alt: 'Espelho redondo com luz ao lado da cabeceira e cama com roupa de cama branca e azul' },
    },
  ],
  [
    {
      id: 'adega',
      titulo: 'Adega',
      midia: { tipo: 'video', arquivo: 'detalhe-adega', largura: 576, altura: 460, alt: 'Parede de adega em madeira com garrafas presas em suportes e luz lateral' },
    },
    {
      id: 'cantos',
      titulo: 'Cantos arredondados',
      midia: { tipo: 'video', arquivo: 'detalhe-aparador', largura: 576, altura: 460, alt: 'Câmera percorre um aparador suspenso em madeira com canto arredondado' },
    },
  ],
];
