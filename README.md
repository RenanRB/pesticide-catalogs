# EPA catalog

Lista de produtos com registro **ativo** na EPA (FIFRA seção 3) e pelo menos um uso agrícola, uma entrada por número
de registro (EPA Reg. No.), em JSON compacto. É usada pelo caderno de aplicação do [PulveCast](https://pulvecast.com)
nos Estados Unidos, no mesmo formato do [agrofit-catalog](https://github.com/RenanRB/agrofit-catalog).

- `data/manifest.json`: data da última mudança (`updatedAt`), quantidade de produtos e SHA-256 de `products.json`.
- `data/products.json`: `{version, source, products: [{r, b, f, a, h, c, t, e, u?}]}`, onde `r` é o EPA Reg. No.
  (`100-1652`), `b` o nome do produto e os nomes alternativos ativos, `f` a formulação, `a` os ingredientes ativos com
  a porcentagem, `h` o registrante, `c` os tipos (Herbicide, Insecticide…), `t` a palavra de advertência do rótulo
  (DANGER, WARNING, CAUTION), `e` vazio (os EUA não têm classe ambiental) e `u: 1` nos **Restricted Use Pesticides**.

Publicado pelo GitHub Pages em `https://renanrb.github.io/epa-catalog/data/`.

## Como a lista é reduzida

Fonte: arquivos de download do **PPIS** (Pesticide Product Information System), texto de largura fixa; as posições
dos campos seguem o dicionário de dados da EPA (`ppisdata.pdf`). Entram os registros de `PRODUCT.TXT` sem data de
cancelamento, exceto "Technical Chemical" e "Formulation Intermediate" (uso industrial), com pelo menos um local de uso
agrícola em `PRODSITE.TXT` (grupos de site 01–28 culturas, 30 florestas, 40 solo de culturas, 66 áreas agrícolas não
cultivadas). Ficam de fora ornamentais, gramados, animais, edificações e desinfetantes. O nome do ingrediente ativo é o
ISO quando existe (`CHEMNAME.TXT`). Marcas de distribuidores (`DIST.TXT`) ainda não entram.

## Atualização

Toda quarta-feira o workflow `weekly EPA catalog` baixa os arquivos (a EPA atualiza na terça), reduz a lista e faz
commit só quando ela mudou. Se a EPA estiver fora do ar, se o layout mudar ou se vierem menos de 3.000 produtos, o
build falha e a lista publicada continua a anterior.

Localmente: `node build.mjs` (baixa da EPA) ou `node build.mjs <pasta com os .txt>`; testes: `node --test catalog.test.mjs`.

## Fonte e licença dos dados

Dados: **U.S. Environmental Protection Agency, Pesticide Product Information System (PPIS)**,
<https://www.epa.gov/pesticides/PPISdata>, obra do governo dos EUA. Esta lista é uma derivação para facilitar a
digitação: não é recomendação de uso, não substitui o rótulo (the label is the law) e não indica se um produto está
registrado no seu estado, se pode ser aplicado por drone nem se é permitido em uma cultura.

Código: MIT.
