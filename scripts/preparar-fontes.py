"""Gera a fonte de titulos do site a partir da Newsreader variavel (SIL Open Font License).

Fixa o corte optico de display (opsz 72) e um unico peso, e guarda so os caracteres do
portugues. O arquivo cai de cerca de 130 KB para perto de 15 KB, e so isso vai para o site.

Uso: python scripts/preparar-fontes.py  (exige fonttools e brotli; a fonte vem de
@fontsource-variable/newsreader, instalada so quando for preciso regenerar).
"""

from io import BytesIO
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

RAIZ = Path(__file__).resolve().parent.parent
ORIGEM = RAIZ / "node_modules" / "@fontsource-variable" / "newsreader" / "files"
DESTINO = RAIZ / "src" / "assets" / "fontes"

TEXTO = (
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    "ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç .,;:!?-–—()'\"“”‘’/&@#%+·→"
)


def gerar(entrada: str, saida: str) -> None:
    fonte = TTFont(ORIGEM / entrada)
    fonte = instancer.instantiateVariableFont(fonte, {"opsz": 72, "wght": 320})
    # regrava em memória antes de recortar: o recorte não lida com as tabelas ainda "preguiçosas" do instanciador
    memoria = BytesIO()
    fonte.save(memoria)
    memoria.seek(0)
    fonte = TTFont(memoria)
    opcoes = subset.Options()
    opcoes.layout_features = ["kern", "liga", "lnum", "ccmp", "locl", "mark", "mkmk"]
    opcoes.flavor = "woff2"
    opcoes.notdef_outline = True
    sub = subset.Subsetter(opcoes)
    sub.populate(text=TEXTO)
    sub.subset(fonte)
    fonte.flavor = "woff2"
    DESTINO.mkdir(parents=True, exist_ok=True)
    fonte.save(DESTINO / saida)
    print(saida, (DESTINO / saida).stat().st_size // 1024, "KB")


gerar("newsreader-latin-opsz-normal.woff2", "newsreader-display.woff2")
gerar("newsreader-latin-opsz-italic.woff2", "newsreader-display-italico.woff2")
