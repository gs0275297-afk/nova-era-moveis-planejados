"""Recorta trechos curtos dos videos da Nova Era para a secao de detalhes.

Os videos originais (576x1024, 30 fps) sao reels do Instagram: tem musica, o
@ do perfil e o credito da musica no lado direito (y ~ 240-360) e, em um deles,
a logo na parte de baixo (y ~ 830-930). Usamos so trechos sem transicoes e
recortamos uma faixa 5:4 entre essas sobreposicoes: nada e borrado nem apagado.
O audio e descartado.

Saida: public/videos/<nome>.mp4 + poster <nome>.jpg (primeiro quadro).
"""

import subprocess
from pathlib import Path

import imageio_ffmpeg

RAIZ = Path(__file__).resolve().parent.parent
ORIGEM = RAIZ / "fotos e videos"
DESTINO = RAIZ / "public" / "videos"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

# nome -> (arquivo, inicio s, duracao s, velocidade, y do recorte)
TRECHOS = {
    "detalhe-adega": ("14.39.20", 5.7, 3.0, 0.8, 366),
    "detalhe-aparador": ("14.39.29", 5.0, 3.3, 0.8, 372),
}

LARGURA, ALTURA = 576, 460  # 5:4


def rodar(args: list[str]) -> None:
    subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def main() -> None:
    DESTINO.mkdir(parents=True, exist_ok=True)
    for nome, (arquivo, inicio, duracao, velocidade, y) in TRECHOS.items():
        fonte = ORIGEM / f"WhatsApp Video 2026-10-29 at {arquivo}.mp4"
        saida = DESTINO / f"{nome}.mp4"
        filtros = f"crop={LARGURA}:{ALTURA}:0:{y},setpts={1 / velocidade:.4f}*PTS,fps=30,format=yuv420p"
        rodar([
            "-ss", f"{inicio}", "-t", f"{duracao}", "-i", str(fonte),
            "-vf", filtros, "-an",
            "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-profile:v", "high",
            "-movflags", "+faststart", str(saida),
        ])
        rodar(["-i", str(saida), "-frames:v", "1", "-q:v", "3", str(DESTINO / f"{nome}.jpg")])
        print(f"{nome:20} {saida.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
