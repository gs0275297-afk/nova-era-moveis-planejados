"""Gera as texturas procedurais do simulador 3D (sem downloads).

Todas são procedurais e se repetem sem emenda: o ruído é criado no domínio da
frequência (FFT), que é periódico por construção. Saída: public/3d/texturas/.

- madeira-veio: veio neutro e claro; a cor da madeira é aplicada no 3D (material.color)
- granito-claro / pedra-escura: bancadas
- piso: uma placa de porcelanato 90x90 cm com rejunte
- tecido: trama discreta (estofados e banquetas)
- marmore-claro / quartzo-branco: bancadas
- laca-normal: micro-relevo (mapa normal) das superfícies lisas, para a luz não ficar "de plástico"
- piso-cor / piso-rug: porcelanato de 4 x 4 placas (3,6 m), cada placa com tom e veios próprios
- gesso-normal: textura muito suave de parede pintada
- escovado-normal: riscos finos de metal escovado

As lâminas de madeira (lamina-*.webp) vêm da Poly Haven (CC0) e não são geradas aqui.
"""

from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates

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


def deformar(campo: np.ndarray, dx: np.ndarray, dy: np.ndarray) -> np.ndarray:
    """Amostra o campo em coordenadas deslocadas, mantendo a repetição sem emenda."""
    tam = campo.shape[0]
    y, x = np.mgrid[0:tam, 0:tam].astype(float)
    return map_coordinates(campo, [y + dy, x + dx], order=1, mode="grid-wrap")


def veios(tam: int, a: int, b: int, torcao: float, largura: float) -> np.ndarray:
    """Veios com direção dominante: zeros de uma fase linear (a, b inteiros: repete sem emenda) torcida por
    ruído suave. A torção é menor que a inclinação da fase, então as linhas fluem sem formar círculos."""
    y, x = np.mgrid[0:tam, 0:tam] / tam
    fase = 2 * np.pi * (a * x + b * y)
    fase = fase + torcao * ruido(tam, 300, expoente=4.0) + 0.3 * torcao * ruido(tam, 90, expoente=3.4)
    fase = fase + 0.07 * gaussian_filter(ruido(tam, 12, expoente=2.0), 1.2, mode="wrap")
    espessura = largura * (0.25 + 1.5 * suave(-1.2, 1.4, ruido(tam, 200, expoente=3.5)))
    return np.clip(1 - np.abs(np.sin(fase)) / espessura, 0, 1) ** 1.3


def marmore(tam: int = 1536) -> np.ndarray:
    """Mármore claro: fundo com nuvens muito leves, veios cinza-dourados longos e veios capilares."""
    rgb = np.ones((tam, tam, 3)) * cor("#f0ede7")
    rgb *= (1 + 0.012 * ruido(tam, 340, expoente=3.4) + 0.004 * ruido(tam, 30))[..., None]
    principal = veios(tam, 1, 2, 1.5, 0.05) * suave(-1.0, 0.2, ruido(tam, 300, expoente=3.5))
    secundario = veios(tam, 3, 1, 1.9, 0.03) * suave(-0.5, 0.9, ruido(tam, 340, expoente=3.5))
    capilar = veios(tam, 5, 3, 2.6, 0.018) * suave(0.0, 1.2, ruido(tam, 240, expoente=3.5)) * 0.5
    halo = gaussian_filter(principal, 16, mode="wrap")
    halo = np.clip(halo / (halo.max() + 1e-6) * 1.6, 0, 1)[..., None]
    rgb = rgb * (1 - halo * 0.32) + cor("#bdb3a2") * halo * 0.32
    marca = np.clip(principal * 0.95 + secundario * 0.7 + capilar, 0, 1)[..., None]
    rgb = rgb * (1 - marca * 0.78) + cor("#7f7464") * marca * 0.78
    ouro = (principal * suave(0.0, 1.0, ruido(tam, 200, expoente=3.0)))[..., None]
    return rgb * (1 - ouro * 0.5) + cor("#a68653") * ouro * 0.5


def pedra_escura(tam: int = 1024) -> np.ndarray:
    """Pedra quase preta com grão fino e poucos veios claros, como um mármore negro."""
    rgb = np.ones((tam, tam, 3)) * cor("#17181a")
    rgb *= (1 + 0.08 * ruido(tam, 260, expoente=3.4) + 0.04 * ruido(tam, 3, expoente=1.4))[..., None]
    principal = veios(tam, 1, 2, 1.6, 0.035) * suave(-0.8, 0.4, ruido(tam, 260, expoente=3.5))
    capilar = veios(tam, 4, 1, 2.4, 0.016) * suave(-0.1, 1.1, ruido(tam, 220, expoente=3.5)) * 0.6
    marca = np.clip(principal + capilar, 0, 1)[..., None]
    return rgb * (1 - marca * 0.8) + cor("#cfc9bb") * marca * 0.8


def piso_cor(tam: int = 2048, placas: int = 4) -> np.ndarray:
    """Porcelanato acetinado: cada placa com tom próprio e o desenho deslocado, para não parecer repetido."""
    lado = tam // placas
    nuvem = ruido(tam, 280, expoente=3.4)
    grao = ruido(tam, 5, expoente=1.6)
    veio = veios(tam, 2, 3, 1.8, 0.03) * suave(-0.4, 0.9, ruido(tam, 300, expoente=3.5))
    rgb = np.zeros((tam, tam, 3))
    base = cor("#d9d4ca")
    for j in range(placas):
        for i in range(placas):
            ox, oy = rng.integers(0, tam, 2)
            tom = 1 + rng.normal(0, 0.008)
            trecho_n = np.roll(np.roll(nuvem, ox, 1), oy, 0)[:lado, :lado]
            trecho_v = np.roll(np.roll(veio, oy, 1), ox, 0)[:lado, :lado]
            trecho_g = np.roll(np.roll(grao, ox, 0), oy, 1)[:lado, :lado]
            v = tom * (1 + 0.007 * trecho_n + 0.005 * trecho_g) - 0.07 * trecho_v
            rgb[j * lado : (j + 1) * lado, i * lado : (i + 1) * lado] = base * v[..., None]
    rejunte = 3
    y, x = np.mgrid[0:tam, 0:tam]
    junta = (x % lado < rejunte) | (y % lado < rejunte)
    rgb[junta] = cor("#a79f92")
    return rgb


def piso_rug(tam: int = 1024, placas: int = 4) -> np.ndarray:
    """Rugosidade (canal verde): base acetinada com variação suave; o rejunte é fosco."""
    v = 0.30 + 0.05 * ruido(tam, 160, expoente=2.8) + 0.02 * ruido(tam, 8, expoente=1.6)
    lado = tam // placas
    y, x = np.mgrid[0:tam, 0:tam]
    v[(x % lado < 2) | (y % lado < 2)] = 0.95
    return np.clip(v, 0.12, 1)[..., None] * np.ones(3)


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
    salvar("marmore-claro", marmore(), qualidade=84)
    salvar(
        "quartzo-branco",
        granito(768, "#eeede9", [("#d9d6d0", 1.6, 1.0), ("#bdb9b2", 1.3, 2.0), ("#fbfaf8", 1.8, 1.2)], 0.015),
        qualidade=80,
    )
    salvar("laca-normal", normal_de_altura(ruido(512, 9, expoente=1.6) * 0.6 + ruido(512, 60) * 0.4, 0.35), qualidade=90)
    salvar("pedra-escura", pedra_escura(), qualidade=82)
    salvar("piso-cor", piso_cor(), qualidade=82)
    salvar("piso-rug", piso_rug(), qualidade=78)
    salvar("gesso-normal", normal_de_altura(ruido(512, 22, expoente=2.2) * 0.5 + ruido(512, 90, expoente=2.6) * 0.5, 0.5), qualidade=88)
    salvar("escovado-normal", normal_de_altura(ruido(256, 1.6, anis=(1.0, 45), expoente=1.2), 0.5), qualidade=88)


if __name__ == "__main__":
    main()
