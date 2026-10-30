"""Gera as texturas procedurais do simulador 3D (sem downloads).

Todas são procedurais e se repetem sem emenda: o ruído é criado no domínio da
frequência (FFT), que é periódico por construção. Saída: public/3d/texturas/.

- madeira-veio: veio neutro e claro; a cor da madeira é aplicada no 3D (material.color)
- granito-claro / pedra-escura: bancadas
- piso: uma placa de porcelanato 90x90 cm com rejunte
- tecido: trama discreta (estofados e banquetas)
- marmore-claro / quartzo-branco: bancadas
- laca-normal: micro-relevo (mapa normal) das superfícies lisas, para a luz não ficar "de plástico"

As lâminas de madeira (lamina-*.webp) vêm da Poly Haven (CC0) e não são geradas aqui.
"""

from pathlib import Path

import numpy as np
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "public" / "3d" / "texturas"
rng = np.random.default_rng(2008)


def ruido(tam: int, escala: float, anis: tuple[float, float] = (1.0, 1.0), expoente: float = 2.0) -> np.ndarray:
    """Ruído periódico com desvio-padrão 1. escala ~ comprimento de onda dominante em px.
    anis multiplica as frequências: anis=(1, 30) alonga as formas na vertical (veio)."""
    fy = np.fft.fftfreq(tam)[:, None] * anis[1]
    fx = np.fft.fftfreq(tam)[None, :] * anis[0]
    f = np.sqrt(fx**2 + fy**2)
    f[0, 0] = 1
    corte = 1.0 / escala
    espectro = (rng.normal(size=(tam, tam)) + 1j * rng.normal(size=(tam, tam)))
    filtro = 1.0 / (1.0 + (f / corte) ** expoente)
    filtro[0, 0] = 0
    campo = np.real(np.fft.ifft2(espectro * filtro))
    campo -= campo.mean()
    return campo / (campo.std() + 1e-9)


def suave(a: np.ndarray, b: np.ndarray, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def salvar(nome: str, rgb: np.ndarray, qualidade: int = 86) -> None:
    img = Image.fromarray(np.clip(rgb * 255, 0, 255).astype(np.uint8), "RGB")
    caminho = DESTINO / f"{nome}.webp"
    img.save(caminho, quality=qualidade, method=6)
    print(f"{nome:16} {img.size} {caminho.stat().st_size // 1024} KB")


def cor(hexa: str) -> np.ndarray:
    hexa = hexa.lstrip("#")
    return np.array([int(hexa[i : i + 2], 16) / 255 for i in (0, 2, 4)])


def madeira(tam: int = 1024) -> np.ndarray:
    """Veio reto de lâmina de madeira, correndo na vertical da textura."""
    # Faixas alongadas na vertical com larguras variadas (anéis vistos de lado).
    faixas = ruido(tam, 14, anis=(1.0, 40)) * 0.7 + ruido(tam, 48, anis=(1.0, 26)) * 0.3
    linhas = 1 - suave(0.9, 2.0, faixas) * 0.38
    fibras = ruido(tam, 2.2, anis=(1.0, 60), expoente=1.2)
    poros = ruido(tam, 1.5, expoente=1.0)
    manchas = ruido(tam, 300, anis=(1.0, 3))
    v = 0.9 * linhas + 0.025 * fibras - 0.03 * np.clip(poros - 2.2, 0, 1) + 0.035 * manchas + 0.07
    v = np.clip(v, 0.45, 1.05)
    base = cor("#f5eadc")
    return base[None, None, :] * v[..., None]


def granito(tam: int, fundo: str, pontos: list[tuple[str, float, float]], variacao: float) -> np.ndarray:
    """Pontilhado de pedra: cada tom aparece onde o ruído passa do limiar (em desvios-padrão)."""
    rgb = np.ones((tam, tam, 3)) * cor(fundo)
    rgb *= (1 + variacao * ruido(tam, 140))[..., None]
    for tom, escala, limiar in pontos:
        campo = ruido(tam, escala, expoente=1.8)
        mascara = suave(limiar, limiar + 0.35, campo)
        rgb = rgb * (1 - mascara[..., None]) + cor(tom) * mascara[..., None]
    return rgb


def piso(tam: int = 1024) -> np.ndarray:
    rgb = np.ones((tam, tam, 3)) * cor("#d8d2c8")
    rgb *= (1 + 0.025 * ruido(tam, 200) + 0.012 * ruido(tam, 18))[..., None]
    rejunte = 4
    borda = np.zeros((tam, tam), bool)
    borda[:rejunte, :] = borda[:, :rejunte] = True
    rgb[borda] = cor("#9d9587")
    return rgb


def tecido(tam: int = 512) -> np.ndarray:
    y, x = np.mgrid[0:tam, 0:tam]
    trama = 0.5 + 0.5 * np.sin(2 * np.pi * x / 4) * np.sin(2 * np.pi * y / 4)
    v = 0.9 + 0.05 * trama + 0.04 * ruido(tam, 6) + 0.03 * ruido(tam, 90)
    return np.ones((tam, tam, 3)) * v[..., None]


def marmore(tam: int = 1024) -> np.ndarray:
    """Mármore claro: fundo levemente nebuloso e poucos veios longos, na diagonal, com halo suave.
    O ruído de deformação é bem suave (expoente alto), para os veios fluírem em vez de formarem contornos."""
    rgb = np.ones((tam, tam, 3)) * cor("#ece9e3")
    rgb *= (1 + 0.03 * ruido(tam, 300, expoente=4) + 0.006 * ruido(tam, 30))[..., None]
    y, x = np.mgrid[0:tam, 0:tam] / tam
    deforma = ruido(tam, 260, expoente=4) * 0.7 + ruido(tam, 70, expoente=3) * 0.08
    principal = np.abs(np.sin(np.pi * (x + y) * 2 + deforma * 0.9))
    ramo = np.abs(np.sin(np.pi * (2 * x - y) * 2 + deforma * 1.2 + 1.3))
    marca = (1 - suave(0.0, 0.03, principal)) * 0.8 + (1 - suave(0.0, 0.25, principal)) * 0.16
    marca += (1 - suave(0.0, 0.018, ramo)) * 0.35 * suave(-0.2, 0.6, ruido(tam, 200, expoente=4))
    marca = np.clip(marca, 0, 1)
    tom = cor("#9a958d")
    return rgb * (1 - marca[..., None] * 0.7) + tom * (marca[..., None] * 0.7)


def normal_de_altura(altura: np.ndarray, forca: float) -> np.ndarray:
    """Converte um mapa de altura periódico em mapa normal (espaço tangente, 0..1)."""
    dx = (np.roll(altura, -1, axis=1) - np.roll(altura, 1, axis=1)) * forca
    dy = (np.roll(altura, -1, axis=0) - np.roll(altura, 1, axis=0)) * forca
    n = np.stack([-dx, dy, np.ones_like(altura)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def main() -> None:
    DESTINO.mkdir(parents=True, exist_ok=True)
    salvar("madeira-veio", madeira())
    salvar(
        "granito-claro",
        granito(
            768,
            "#d6d1c7",
            [("#a39a8d", 2.6, 0.9), ("#f2efe9", 2.2, 1.1), ("#4a4743", 1.8, 1.7), ("#b8a184", 3.2, 1.6)],
            0.03,
        ),
        qualidade=78,
    )
    salvar(
        "pedra-escura",
        granito(768, "#1e1d1c", [("#34322f", 2.0, 0.8), ("#5a554e", 1.6, 1.9), ("#0f0f0e", 2.6, 1.2)], 0.05),
        qualidade=78,
    )
    salvar("piso", piso())
    salvar("tecido", tecido(), qualidade=80)
    # Novas (Nova Era): no fim da sequência para as texturas acima continuarem idênticas.
    salvar("marmore-claro", marmore(), qualidade=80)
    salvar(
        "quartzo-branco",
        granito(768, "#eeede9", [("#d9d6d0", 1.6, 1.0), ("#bdb9b2", 1.3, 2.0), ("#fbfaf8", 1.8, 1.2)], 0.015),
        qualidade=80,
    )
    salvar("laca-normal", normal_de_altura(ruido(512, 9, expoente=1.6) * 0.6 + ruido(512, 60) * 0.4, 0.35), qualidade=90)


if __name__ == "__main__":
    main()
