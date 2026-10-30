"""Trata as fotos reais da Nova Era e grava os recortes usados no site.

Le os originais em "fotos e videos/" (nunca altera esses arquivos) e grava em src/assets/fotos/.
O Astro gera os AVIF responsivos a partir dessas copias no build.

Tudo aqui e processamento classico e deterministico, sem IA: nenhum detalhe e criado, apagado ou
retocado, e os moveis, as cores dos materiais e a marca d'agua nao sao pintados nem editados.
1. compressao: reduz o ruido de cor e os blocos deixados pelo WhatsApp (os originais tem 1179 px);
2. cor: correcao parcial do tom da luz, limitada, para nao mudar a cor das madeiras e dos laqueados;
3. luz: pontos de preto e branco, exposicao e contraste local moderados;
4. verticais: endireita as paredes inclinadas pela lente grande-angular;
5. enquadramento: recorta a propria foto. Sempre que possivel, o recorte deixa a marca d'agua de fora,
   em vez de corta-la pela metade, e tira o primeiro plano distorcido;
6. tamanho e nitidez: reamostragem Lanczos e nitidez aplicada so nas bordas, sem realcar ruido.

Requer: pillow, numpy, scipy e scikit-image.

Originais fora do site: 14.39.10 (2) quase nao mostra moveis; 14.39.13, 14.39.15 (2) e 14.39.16
repetem ambientes por outro angulo; em 14.39.24 a marca d'agua fica junto ao movel e nao ha recorte
que a evite sem cortar a peca. 14.39.11 entra so como detalhe.
Marca d'agua inteira e visivel, porque o recorte cortaria o movel: 14.39.10, 14.39.10 (1), 14.39.11 (1)
e 14.39.12 (1). Saem limpas quando a empresa enviar os arquivos sem marca.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageOps
from scipy.ndimage import convolve, gaussian_filter, sobel
from skimage.color import lab2rgb, rgb2lab
from skimage.exposure import equalize_adapthist
from skimage.feature import canny
from skimage.restoration import denoise_nl_means
from skimage.transform import probabilistic_hough_line

RAIZ = Path(__file__).resolve().parent.parent
ORIGEM = RAIZ / "fotos e videos"
DESTINO = RAIZ / "src" / "assets" / "fotos"
LOGO = RAIZ / "src" / "assets" / "logo" / "logo-nova-era.png"
PREFIXO = "WhatsApp Image 2026-10-29 at "

# nome -> (original, recorte em % da foto (x0, y0, x1, y1), largura final em px)
FOTOS = {
    # abertura
    "abertura": ("14.39.23", (0, 0, 100, 82), 1886),
    # sala de jantar e adega
    "jantar-ampla": ("14.39.22 (1)", (0, 26, 100, 75), 1860),
    "jantar-adega": ("14.39.22", (0, 6, 100, 81), 1240),
    # cozinha em tons de areia
    "cozinha-areia-bancada": ("14.39.18", (0, 7, 100, 80), 1240),
    "cozinha-areia-coifa": ("14.39.18 (1)", (0, 0, 100, 78), 1240),
    "cozinha-u-inox": ("14.39.18 (2)", (0, 2, 100, 97), 1179),
    # area gourmet
    "gourmet-prateleiras-ampla": ("14.39.15", (0, 6, 100, 58), 1860),
    "gourmet-cozinha": ("14.39.14 (1)", (0, 20, 100, 78), 1240),
    "gourmet-bar-tv": ("14.39.13 (2)", (0, 14, 100, 79), 1179),
    "gourmet-movel-bar": ("14.39.14 (2)", (0, 2, 100, 77), 1179),
    "gourmet-ilha": ("14.39.14", (0, 20, 100, 76), 1179),
    # living de pe-direito duplo
    "living-pe-direito": ("14.39.23 (2)", (0, 0, 100, 79), 1240),
    "living-aparador-curvo": ("14.39.24 (1)", (38, 10, 100, 92), 900),
    "living-sofa-aparador": ("14.39.23 (1)", (0, 0, 100, 80), 1240),
    # dormitorios
    "dormitorio-cabeceira": ("14.39.16 (1)", (0, 8, 100, 78), 1179),
    "dormitorio-armario-tv": ("14.39.15 (1)", (0, 6, 100, 80), 1179),
    "dormitorio-marmorizado-cabeceira": ("14.39.10 (1)", (0, 0, 100, 100), 1240),
    "dormitorio-marmorizado-tv": ("14.39.10", (0, 0, 100, 100), 1240),
    "dormitorio-escrivaninha": ("14.39.16 (2)", (0, 5, 100, 79), 1179),
    # sala revestida em madeira
    "sala-madeira-vista": ("14.39.13 (1)", (0, 18, 100, 79), 1240),
    "sala-madeira-painel": ("14.39.12 (2)", (0, 8, 100, 72), 1179),
    "sala-madeira-mesa": ("14.39.12", (0, 16, 100, 79), 1179),
    # mais cozinhas e salas, banheiro e hall
    "cozinha-torre-vidro": ("14.39.11 (2)", (12, 0, 100, 80), 1100),
    "cozinha-aereos-madeira": ("14.39.17", (0, 6, 100, 77), 1179),
    "sala-painel-marmorizado": ("14.39.11 (1)", (0, 0, 100, 100), 1400),
    "sala-rack-azul": ("14.39.17 (1)", (0, 3, 100, 81), 1179),
    "banheiro-bancada": ("14.39.17 (2)", (0, 5, 100, 78), 1179),
    "hall-ripado-espelho": ("14.39.12 (1)", (2, 0, 100, 100), 1179),
    # detalhes
    "detalhe-iluminacao": ("14.39.14 (2)", (10, 8, 70, 40), 900),
    "detalhe-ripado": ("14.39.11", (0, 0, 42, 71), 640),
    "detalhe-cabeceira": ("14.39.16 (1)", (4, 49, 58, 76), 1000),
}

# Ajustes de um original: "cor" e a forca da correcao de cor (padrao 0,4); "reto", a das verticais (padrao 0,85);
# "nitidez", um multiplicador da nitidez final (padrao 1).
AJUSTES = {
    # o tom quente da madeira e do LED faz parte destes ambientes
    "14.39.23": {"cor": 0.2},
    "14.39.22": {"cor": 0.25},
    "14.39.22 (1)": {"cor": 0.25},
    # a pedra salpicada de dourado fica aspera com a nitidez normal
    "14.39.15": {"nitidez": 0.55},
}

NITIDEZ_FINA = 0.75
NITIDEZ_MEDIA = 0.28


def abrir(original: str) -> np.ndarray:
    img = ImageOps.exif_transpose(Image.open(ORIGEM / f"{PREFIXO}{original}.jpeg")).convert("RGB")
    return np.asarray(img, dtype=np.float32) / 255


def ganhos_de_cor(rgb: np.ndarray, forca: float) -> np.ndarray:
    """Estimativa "grey-edge": nas bordas da imagem, a media das cores tende ao tom da luz."""
    bordas = np.stack([np.hypot(sobel(gaussian_filter(rgb[..., c], 1), 0), sobel(gaussian_filter(rgb[..., c], 1), 1)) for c in range(3)], axis=-1)
    luz = np.mean(bordas**6, axis=(0, 1)) ** (1 / 6)
    alvo = luz.mean()
    ganhos = (alvo / luz) ** forca
    return np.clip(ganhos / np.mean(ganhos), 0.94, 1.07)


def estimar_ruido(l: np.ndarray) -> float:
    """Estimativa rapida do ruido (metodo de Immerkaer)."""
    filtro = np.array([[1, -2, 1], [-2, 4, -2], [1, -2, 1]], dtype=np.float32)
    return float(np.sqrt(np.pi / 2) * np.mean(np.abs(convolve(l, filtro))) / 6)


def tratar_luz(rgb: np.ndarray, forca_cor: float) -> np.ndarray:
    rgb = np.clip(rgb * ganhos_de_cor(rgb, forca_cor), 0, 1)
    lab = rgb2lab(rgb)
    l = lab[..., 0] / 100

    # compressao: a cor, salva pelo WhatsApp em baixa resolucao, e a parte mais prejudicada
    lab[..., 1] = gaussian_filter(lab[..., 1], 1.1)
    lab[..., 2] = gaussian_filter(lab[..., 2], 1.1)
    sigma = estimar_ruido(l)
    limpo = denoise_nl_means(l, patch_size=3, patch_distance=5, h=max(sigma, 0.004) * 0.6, sigma=sigma, fast_mode=True)
    # meio a meio: mais do que isso apaga o veio da madeira junto com os blocos
    l = 0.5 * limpo + 0.5 * l

    # pontos de preto e branco, sem esticar por inteiro
    preto, branco = np.percentile(l, [0.4, 99.6])
    topo = (max(branco, 0.9) + 1) / 2
    l = np.clip((l - preto * 0.7) / (topo - preto * 0.7), 0, 1)

    # exposicao: aproxima de leve a mediana do meio-tom, sem clarear salas escuras a ponto de mudar o clima
    mediana = float(np.median(l))
    gama = np.clip(np.log(0.5) / np.log(np.clip(mediana, 0.05, 0.95)), 0.88, 1.12)
    l = l ** (1 + (gama - 1) * 0.6)

    # contraste local moderado e curva em S suave
    local = equalize_adapthist(l, kernel_size=max(l.shape) // 6, clip_limit=0.005)
    l = 0.72 * l + 0.28 * local
    l = np.clip(l + 0.015 * np.sin(2 * np.pi * (l - 0.5)), 0, 1)

    lab[..., 0] = l * 100
    return np.clip(lab2rgb(lab), 0, 1).astype(np.float32)


def medir_inclinacao(rgb: np.ndarray) -> tuple[float, float, int]:
    """Mede as linhas quase verticais. Devolve a e b de: inclinacao(x) = a + b * (x - centro) / largura."""
    cinza = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    h, w = cinza.shape
    passo = max(1, round(h / 900))
    cinza = cinza[::passo, ::passo]
    h, w = cinza.shape
    segmentos = probabilistic_hough_line(
        canny(cinza, sigma=2),
        threshold=25,
        line_length=int(0.1 * h),
        line_gap=5,
        theta=np.deg2rad(np.linspace(-13, 13, 105)),
        rng=0,
    )
    dados = []
    for (x0, y0), (x1, y1) in segmentos:
        dy = y1 - y0
        if abs(dy) < 1:
            continue
        inclinacao = (x1 - x0) / dy
        x_meio = (x0 + x1) / 2 + inclinacao * (h / 2 - (y0 + y1) / 2)
        dados.append((inclinacao, (x_meio - w / 2) / w, abs(dy)))
    if len(dados) < 6:
        return 0.0, 0.0, len(dados)
    d = np.array(dados)
    a, b = np.median(d[:, 0]), 0.0
    for _ in range(8):
        erro = np.abs(d[:, 0] - (a + b * d[:, 1]))
        limite = max(np.median(erro) * 2.5, 0.004)
        peso = d[:, 2] * (erro < limite)
        A = np.stack([np.ones(len(d)), d[:, 1]], axis=1)
        a, b = np.linalg.lstsq(A * peso[:, None], d[:, 0] * peso, rcond=None)[0]
    return float(a), float(b), len(d)


def endireitar(rgb: np.ndarray, forca: float) -> tuple[np.ndarray, str]:
    """Deixa as paredes na vertical com um trapezio sempre dentro da foto: nunca sobram cantos vazios."""
    h, w = rgb.shape[:2]
    a, b, linhas = medir_inclinacao(rgb)
    if forca <= 0 or linhas < 6:
        return rgb, f"sem ajuste ({linhas} linhas)"

    def inclinacao(x: float) -> float:
        i = forca * (a + b * (x - w / 2) / w)
        return float(np.clip(i, -0.07 * w / h, 0.07 * w / h))

    x_e, x_d = 0.0, float(w)
    for _ in range(4):
        x_e = abs(inclinacao(x_e)) * h / 2
        x_d = w - abs(inclinacao(x_d)) * h / 2
    i_e, i_d = inclinacao(x_e), inclinacao(x_d)
    origem = [(x_e - i_e * h / 2, 0), (x_d - i_d * h / 2, 0), (x_d + i_d * h / 2, h), (x_e + i_e * h / 2, h)]
    nova_l = round(x_d - x_e)
    destino = [(0, 0), (nova_l, 0), (nova_l, h), (0, h)]
    m = []
    for (xd, yd), (xo, yo) in zip(destino, origem):
        m.append([xd, yd, 1, 0, 0, 0, -xo * xd, -xo * yd])
        m.append([0, 0, 0, xd, yd, 1, -yo * xd, -yo * yd])
    coef = np.linalg.solve(np.array(m, dtype=np.float64), np.array(origem, dtype=np.float64).ravel())
    img = Image.fromarray((rgb * 255 + 0.5).astype(np.uint8))
    saida = img.transform((nova_l, h), Image.PERSPECTIVE, tuple(coef), Image.BICUBIC)
    return np.asarray(saida, dtype=np.float32) / 255, f"verticais a={a:+.3f} b={b:+.3f} ({linhas} linhas)"


def nitidez(rgb: np.ndarray, fator: float, forca: float = 1.0) -> np.ndarray:
    """Nitidez so perto das bordas: nas paredes lisas, o que apareceria seria o resto da compressao."""
    y = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    s1, s2 = 0.9 * fator, 2.6 * fator
    detalhe = forca * (NITIDEZ_FINA * (y - gaussian_filter(y, s1)) + NITIDEZ_MEDIA * (y - gaussian_filter(y, s2)))
    borda = np.hypot(sobel(gaussian_filter(y, s1), 0), sobel(gaussian_filter(y, s1), 1))
    mascara = np.clip((gaussian_filter(borda, 1.5 * fator) - 0.015) / 0.09, 0, 1)
    return np.clip(rgb + (detalhe * mascara)[..., None], 0, 1)


def gerar_og() -> None:
    """Imagem de compartilhamento 1200x630: foto da abertura + logo sobre o fundo branco da propria logo."""
    og = Image.new("RGB", (1200, 630), "white")
    foto = Image.open(DESTINO / "abertura.jpg")
    largura_foto = 720
    foto = foto.resize((largura_foto, round(foto.height * largura_foto / foto.width)), Image.LANCZOS)
    topo = round((foto.height - 630) * 0.35)
    og.paste(foto.crop((0, topo, largura_foto, topo + 630)), (0, 0))
    logo = Image.open(LOGO).convert("RGB")
    logo.thumbnail((380, 380), Image.LANCZOS)
    og.paste(logo, (largura_foto + (480 - logo.width) // 2, (630 - logo.height) // 2))
    saida = RAIZ / "public" / "og-nova-era.jpg"
    og.save(saida, quality=86, optimize=True, progressive=True)
    print(f"{'og-nova-era':34} {saida.stat().st_size // 1024} KB")


def main() -> None:
    DESTINO.mkdir(parents=True, exist_ok=True)
    tratadas: dict[str, np.ndarray] = {}
    usados = set()
    for nome, (original, (x0, y0, x1, y1), largura) in FOTOS.items():
        usados.add(f"{nome}.jpg")
        if original not in tratadas:
            ajuste = AJUSTES.get(original, {})
            base = tratar_luz(abrir(original), ajuste.get("cor", 0.4))
            tratadas[original], nota = endireitar(base, ajuste.get("reto", 0.85))
            print(f"  {original:14} {nota}")
        foto = tratadas[original]
        h, w = foto.shape[:2]
        recorte = foto[round(h * y0 / 100) : round(h * y1 / 100), round(w * x0 / 100) : round(w * x1 / 100)]
        fator = min(1.6, max(1.0, largura / recorte.shape[1]))
        img = Image.fromarray((recorte * 255 + 0.5).astype(np.uint8))
        if fator > 1:
            img = img.resize((round(img.width * fator), round(img.height * fator)), Image.LANCZOS)
        final = nitidez(np.asarray(img, dtype=np.float32) / 255, fator, AJUSTES.get(original, {}).get("nitidez", 1.0))
        saida = Image.fromarray((final * 255 + 0.5).astype(np.uint8))
        saida.save(DESTINO / f"{nome}.jpg", quality=90, subsampling=0, optimize=True, progressive=True)
        print(f"{nome:34} {saida.width}x{saida.height}  proporcao {saida.width / saida.height:.2f}  {(DESTINO / f'{nome}.jpg').stat().st_size // 1024} KB")
    for velho in DESTINO.glob("*.jpg"):
        if velho.name not in usados:
            velho.unlink()
            print(f"removida {velho.name}")
    gerar_og()


if __name__ == "__main__":
    main()
