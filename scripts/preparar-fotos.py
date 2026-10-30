"""Prepara as fotos reais da Nova Era para o site.

Le os originais em "fotos e videos/" (nunca altera esses arquivos) e grava em
src/assets/fotos/ copias com nomes descritivos. O Astro gera AVIF responsivos
a partir delas no build.

- Fotos inteiras sao copiadas sem recompressao, com a marca d'agua original.
- Recortes (abertura e detalhes) usam so enquadramentos da propria foto; nada e
  apagado, retocado ou gerado.
- Telas cheias: os originais chegaram com 1179 px de largura (compressao do WhatsApp).
  As poucas fotos usadas de borda a borda sao ampliadas por reamostragem classica
  (Lanczos + nitidez leve), sem IA: nenhum detalhe e inventado, so a suavidade diminui.
- Fotos nao usadas: 14.39.10 (2) e 14.39.12 quase nao mostram moveis; 14.39.13,
  14.39.15 (2) e 14.39.23 (1) repetem ambientes ja mostrados por outro angulo.
"""

import shutil
from pathlib import Path

from PIL import Image, ImageFilter

RAIZ = Path(__file__).resolve().parent.parent
ORIGEM = RAIZ / "fotos e videos"
DESTINO = RAIZ / "src" / "assets" / "fotos"
LOGO = RAIZ / "src" / "assets" / "logo" / "logo-nova-era.png"

PREFIXO = "WhatsApp Image 2026-10-29 at "

# nome no site -> arquivo original
FOTOS = {
    # projetos em destaque
    "living-pe-direito-duplo": "14.39.23 (2)",
    "aparador-curvo": "14.39.24 (1)",
    "jantar-adega": "14.39.22 (1)",
    "adega-nichos-led": "14.39.22",
    "cozinha-areia-coifa": "14.39.18 (1)",
    "cozinha-areia-nicho": "14.39.18",
    # galeria por ambiente
    "cozinha-armario-vidro": "14.39.11 (2)",
    "cozinha-aereos-madeira": "14.39.17",
    "cozinha-gourmet-integrada": "14.39.14 (1)",
    "cozinha-ilha-led": "14.39.14",
    "cozinha-u-inox": "14.39.18 (2)",
    "sala-painel-marmore": "14.39.11 (1)",
    "sala-integrada-escada": "14.39.13 (1)",
    "sala-painel-madeira": "14.39.12 (2)",
    "sala-rack-prateleiras": "14.39.17 (1)",
    "living-aparador-quadro": "14.39.24",
    "bar-prateleiras-led": "14.39.14 (2)",
    "bar-nichos-iluminados": "14.39.13 (2)",
    "dormitorio-cabeceira-estofada": "14.39.10 (1)",
    "dormitorio-cabeceira-painel": "14.39.16 (1)",
    "dormitorio-armario-tv": "14.39.15 (1)",
    "dormitorio-painel-tv": "14.39.10",
    "dormitorio-escrivaninha": "14.39.16 (2)",
    "banheiro-bancada-espelheira": "14.39.17 (2)",
    "hall-ripado-espelho": "14.39.12 (1)",
}

# nome -> (arquivo original, caixa de recorte em pixels do original)
RECORTES = {
    # abertura: a parte de cima da foto, acima da marca d'agua
    "abertura-jantar-forro": ("14.39.23", (0, 0, 1179, 1190)),
    # detalhes de execucao (fotos que nao aparecem inteiras no site)
    "detalhe-prateleiras-led": ("14.39.15", (40, 60, 900, 748)),
    "detalhe-ripado-painel": ("14.39.11", (0, 0, 700, 560)),
    "detalhe-espelhos-cabeceira": ("14.39.16", (0, 420, 1000, 1220)),
}

# nome -> (arquivo original, recorte, fator): fotos que ocupam a tela de borda a borda
AMPLIADAS = {
    "abertura-ampliada": ("14.39.23", (0, 0, 1179, 1190), 1.6),
    "jantar-adega-ampla": ("14.39.22 (1)", (0, 215, 1161, 1020), 1.55),
    "panorama-painel": ("14.39.11 (1)", (0, 0, 1179, 680), 1.55),
}


def main() -> None:
    DESTINO.mkdir(parents=True, exist_ok=True)
    for nome, arquivo in FOTOS.items():
        fonte = ORIGEM / f"{PREFIXO}{arquivo}.jpeg"
        shutil.copyfile(fonte, DESTINO / f"{nome}.jpg")
        print(f"{nome:30} {Image.open(fonte).size}")

    for nome, (arquivo, caixa) in RECORTES.items():
        img = Image.open(ORIGEM / f"{PREFIXO}{arquivo}.jpeg").convert("RGB").crop(caixa)
        img.save(DESTINO / f"{nome}.jpg", quality=92, optimize=True, progressive=True)
        print(f"{nome:30} {img.size} (recorte)")

    for nome, (arquivo, caixa, fator) in AMPLIADAS.items():
        img = Image.open(ORIGEM / f"{PREFIXO}{arquivo}.jpeg").convert("RGB").crop(caixa)
        img = img.resize((round(img.width * fator), round(img.height * fator)), Image.LANCZOS)
        img = img.filter(ImageFilter.UnsharpMask(radius=1.6, percent=55, threshold=2))
        img.save(DESTINO / f"{nome}.jpg", quality=90, optimize=True, progressive=True)
        print(f"{nome:30} {img.size} (ampliada, sem IA)")

    gerar_og()


def gerar_og() -> None:
    """Imagem de compartilhamento 1200x630: foto da abertura + logo sobre o fundo claro do site."""
    og = Image.new("RGB", (1200, 630), (244, 243, 239))
    foto = Image.open(DESTINO / "abertura-jantar-forro.jpg")
    largura_foto = 720
    escala = largura_foto / foto.width
    foto = foto.resize((largura_foto, round(foto.height * escala)), Image.LANCZOS)
    topo = round((foto.height - 630) * 0.35)
    og.paste(foto.crop((0, topo, largura_foto, topo + 630)), (0, 0))

    logo = Image.open(LOGO).convert("RGB")
    logo.thumbnail((380, 380), Image.LANCZOS)
    # A logo tem fundo branco: o painel ao lado e branco para nao criar um "cartao" em volta dela.
    painel = Image.new("RGB", (1200 - largura_foto, 630), "white")
    painel.paste(logo, ((painel.width - logo.width) // 2, (630 - logo.height) // 2))
    og.paste(painel, (largura_foto, 0))

    saida = RAIZ / "public" / "og-nova-era.jpg"
    og.save(saida, quality=86, optimize=True, progressive=True)
    print(f"{'og-nova-era':30} {saida.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
