# Logo da Nova Era

Arquivos usados pelo site, gerados por `scripts/preparar-logo.py` a partir do selo enviado pela
empresa (`logo/WhatsApp Image 2026-10-29 at 14.54.09.jpeg`). Não há redesenho nem troca de cor: só recortes.

| Arquivo | O que é | Onde aparece |
|---|---|---|
| `logo-nova-era.png` | miolo do selo (monograma + "NOVA ERA" + "MÓVEIS PLANEJADOS") sobre o branco original | cabeçalho e menu do celular, "multiplicado" sobre o fundo claro |
| `logo-nova-era-selo.png` | selo circular inteiro, transparente só fora do círculo | rodapé (fundo escuro) |

Os ícones da aba (`public/favicon-32.png`, `favicon-192.png`, `apple-touch-icon.png`) usam o monograma "NE"
sobre fundo branco.

O arquivo original é um JPEG de 1179 px com compressão do WhatsApp. Se a empresa tiver a logo em vetor
(SVG, PDF ou AI) ou em PNG de alta resolução, troque o arquivo em `logo/`, ajuste as medidas no topo do
script e rode:

```
python scripts/preparar-logo.py
```
