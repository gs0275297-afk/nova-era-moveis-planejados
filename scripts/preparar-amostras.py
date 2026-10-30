"""Gera, a partir de public/3d/texturas/, as versões leves usadas pelo simulador 3D:

- public/3d/texturas/512/  texturas em 512 px para aparelhos limitados (celular, pouca memória)
- public/3d/amostras/      miniaturas de 96 px das amostras do painel (madeiras e pedras)

Uso: python scripts/preparar-amostras.py  (rode depois de gerar ou trocar as texturas)
"""

from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
TEXTURAS = RAIZ / "public" / "3d" / "texturas"
LEVES = TEXTURAS / "512"
AMOSTRAS = RAIZ / "public" / "3d" / "amostras"

# miniaturas: nome da textura -> nome da amostra (girar = a foto tem veio na horizontal)
MINIATURAS = {
    "lamina-carvalho-cor": ("carvalho", False),
    "lamina-freijo-cor": ("freijo", True),
    "lamina-nogueira-cor": ("nogueira", True),
    "marmore-claro": ("marmore", False),
    "quartzo-branco": ("quartzo", False),
    "granito-claro": ("granito", False),
    "pedra-escura": ("pedra-escura", False),
}


def main() -> None:
    LEVES.mkdir(parents=True, exist_ok=True)
    AMOSTRAS.mkdir(parents=True, exist_ok=True)
    for arquivo in sorted(TEXTURAS.glob("*.webp")):
        img = Image.open(arquivo)
        if img.width > 512:
            img = img.resize((512, 512), Image.LANCZOS)
        img.save(LEVES / arquivo.name, quality=82, method=6)
    for nome, (saida, girar) in MINIATURAS.items():
        img = Image.open(TEXTURAS / f"{nome}.webp").convert("RGB")
        # recorte de ~40% da imagem: a amostra mostra o veio na escala de uma porta
        lado = int(img.width * 0.4)
        img = img.crop((0, 0, lado, lado))
        if girar:
            img = img.rotate(90, expand=True)
        img.resize((96, 96), Image.LANCZOS).save(AMOSTRAS / f"{saida}.webp", quality=80, method=6)
    total = sum(f.stat().st_size for f in LEVES.glob("*.webp")) // 1024
    print(f"512/: {len(list(LEVES.glob('*.webp')))} texturas, {total} KB; amostras: {len(MINIATURAS)}")


if __name__ == "__main__":
    main()
