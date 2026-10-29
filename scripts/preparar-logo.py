"""Gera as versoes da logo oficial da Nova Era usadas no site, sem redesenho.

Origem: o selo circular enviado pela empresa (pasta logo/, JPEG 1179x1170, fundo
branco). Nenhuma cor e alterada e nenhum elemento e redesenhado; so ha recortes:

  src/assets/logo/logo-nova-era.png       miolo do selo (monograma + "NOVA ERA" +
                                          "MOVEIS PLANEJADOS") sobre o branco original.
                                          Os trechos do anel azul que entram nos cantos
                                          do retangulo viram branco (o mesmo fundo).
  src/assets/logo/logo-nova-era-selo.png  o selo inteiro, com transparencia so fora do
                                          circulo (para apoiar sobre fundos escuros).
  public/favicon-32.png, favicon-192.png, apple-touch-icon.png
                                          monograma "NE" sobre fundo branco.

Uso: python scripts/preparar-logo.py
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent.parent
ORIGEM = RAIZ / "logo" / "WhatsApp Image 2026-10-29 at 14.54.09.jpeg"
DESTINO = RAIZ / "src" / "assets" / "logo"
PUBLICO = RAIZ / "public"

# Geometria medida no arquivo original (pixels).
CENTRO = (589, 582)
RAIO_EXTERNO = 584  # borda de fora do anel azul
RAIO_INTERNO = 529  # antes da borda de dentro do anel (~536-540); as letras vao ate ~522
MIOLO = (64, 258, 1110, 815)  # monograma + nome + descritor, com respiro
MONOGRAMA = (380, 279, 796, 564)


def main() -> None:
    DESTINO.mkdir(parents=True, exist_ok=True)
    original = Image.open(ORIGEM).convert("RGB")
    px = np.asarray(original).copy()
    h, w, _ = px.shape
    yy, xx = np.mgrid[0:h, 0:w]
    raio = np.hypot(xx - CENTRO[0], yy - CENTRO[1])

    # Miolo: fora do anel interno e so fundo branco + pedacos do anel.
    miolo = px.copy()
    miolo[raio > RAIO_INTERNO] = 255
    Image.fromarray(miolo).crop(MIOLO).save(DESTINO / "logo-nova-era.png", optimize=True)

    # Selo: transparencia fora do circulo externo, com borda suavizada (supersampling).
    escala = 4
    mascara = Image.new("L", (w * escala, h * escala), 0)
    cx, cy = CENTRO[0] * escala, CENTRO[1] * escala
    r = RAIO_EXTERNO * escala
    ImageDraw.Draw(mascara).ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
    mascara = mascara.resize((w, h), Image.LANCZOS)
    selo = original.copy()
    selo.putalpha(mascara)
    caixa = (CENTRO[0] - RAIO_EXTERNO, max(0, CENTRO[1] - RAIO_EXTERNO), CENTRO[0] + RAIO_EXTERNO, min(h, CENTRO[1] + RAIO_EXTERNO))
    selo = selo.crop(caixa)
    selo.save(DESTINO / "logo-nova-era-selo.png", optimize=True)

    # Icones: monograma centralizado em quadrado branco.
    mono = original.crop(MONOGRAMA)
    for nome, lado, respiro in (("favicon-32.png", 32, 0.1), ("favicon-192.png", 192, 0.16), ("apple-touch-icon.png", 180, 0.18)):
        base = Image.new("RGB", (lado, lado), "white")
        util = round(lado * (1 - 2 * respiro))
        m = mono.copy()
        m.thumbnail((util, util), Image.LANCZOS)
        base.paste(m, ((lado - m.width) // 2, (lado - m.height) // 2))
        base.save(PUBLICO / nome, optimize=True)

    for f in (DESTINO / "logo-nova-era.png", DESTINO / "logo-nova-era-selo.png"):
        im = Image.open(f)
        print(f"{f.name:26} {im.size} {f.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
