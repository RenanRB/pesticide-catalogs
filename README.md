# Pesticide catalogs

Listas de produtos fitossanitários com autorização **vigente**, uma por país, em JSON compacto e no mesmo formato.
São usadas pelo caderno de aplicação do [PulveCast](https://pulvecast.com) para sugerir o produto e guardar o número de
registro. O Brasil continua no [agrofit-catalog](https://github.com/RenanRB/agrofit-catalog), porque os apps já
publicados leem de lá.

| País | Pasta | Fonte oficial | Licença dos dados |
| --- | --- | --- | --- |
| Estados Unidos | `data/us/` | U.S. EPA, Pesticide Product Information System (PPIS) | obra do governo dos EUA |
| França | `data/fr/` | ANSES, E-Phy (data.gouv.fr) | Licence Ouverte / Etalab |
| Itália | `data/it/` | Ministero della Salute, banca dati prodotti fitosanitari | Italian Open Data License 2.0 |
| Argentina | `data/ar/` | SENASA, Registro Nacional de Terapéutica Vegetal (busca pública Vademecum) | nenhuma licença declarada; lista de drones CC BY 4.0 |
| México | `data/mx/` | COFEPRIS, consulta de registros sanitarios de plaguicidas | informação pública, sem licença aberta declarada |
| Grécia | `data/gr/` | Ministério do Desenvolvimento Rural e Alimentação, base dbSYSPEST | "todos os direitos reservados" (permissão pedida ao ministério) |

Publicado pelo GitHub Pages em `https://renanrb.github.io/pesticide-catalogs/data/<país>/`.

## Formato

- `manifest.json`: data da última mudança (`updatedAt`), quantidade de produtos e SHA-256 de `products.json`.
- `products.json`: `{version, source, products: [{r, b, f, a, h, c, t, e, u?, d?}]}`:
  - `r` número de registro / autorização (EPA Reg. No., AMM, numero di registrazione);
  - `b` nomes comerciais; `f` formulação; `a` substâncias ativas com teor; `h` titular; `c` função (herbicida…);
  - `t` advertência do rótulo: EUA `DANGER`/`WARNING`/`CAUTION`, França a palavra-sinal CLP (`DANGER`, `WARNING`
    para "Attention"), Itália vazio (o dado aberto ainda traz só as classes antigas Xn, N…);
  - `e` vazio (classe ambiental, só no AGROFIT);
  - `u: 1` Restricted Use Pesticide (EUA); `d: 1` produto aprovado para aplicação por drone (França: arrêté de
    19/05/2026; Argentina: lista VANT do SENASA; México: o registro cita drone entre os usos).
  - `t` na Argentina: classe toxicológica OMS (`Ia`, `Ib`, `II`, `III`, `IV`); no México: categoria (`1`–`5` ou `I`–`IV`);
    na Grécia: palavra-sinal CLP derivada das frases H (a base não traz a palavra).
- `data/ar/distances.json`: distâncias mínimas de centros urbanos por província e classe toxicológica (dataset oficial
  "Regulaciones sobre aplicación de fitosanitarios", datos.gob.ar, CC BY 4.0).

## Como cada lista é reduzida

- **EUA** (`us/`): registros FIFRA seção 3 ativos (código de cancelamento/transferência em branco e sem data de
  cancelamento), sem formas técnicas, com pelo menos um local de uso agrícola. Detalhes em `us/catalog.mjs`.
- **França** (`fr/`): produtos `PPP`, adjuvantes, mistos e misturas de uso **profissional**, `AUTORISE` ou `RETIRE` ainda
  no prazo de uso (`date fin utilisation` de algum uso ≥ hoje), mais os permis de commerce parallèle autorizados, com o
  rótulo do produto de referência. A URL do ZIP muda toda semana e é resolvida pela API do data.gouv.fr. O selo de
  drone vem de `fr/drone-amm.json`, transcrito do anexo do *arrêté du 19 mai 2026* (lista de produtos aprovados para
  aeronave não tripulada): 132 AMM e os 57 permis de commerce parallèle que o anexo cita; só esses números recebem
  o selo. Atualize à mão quando sair novo arrêté. A ANSES avisa que o E-Phy não é oponível: só o registro
  eletrônico das AMM faz fé.
- **Itália** (`it/`): tudo que não está `Revocato`, `Scaduto` ou `Sospeso`, sem prazo de autorização vencido e sem os
  produtos para uso não profissional (`PFnPO`/`PFnPE` = SI). A URL do CSV leva a data e é lida da página do dataset.

- **Argentina** (`ar/`): busca pública do Vademecum do SENASA (API JSON não documentada, ~37 requisições), só
  inscrições ATIVAS; funções por consulta avançada; selo VANT de `ar/drone-vant.json` (PDF oficial, à mão).
- **México** (`mx/`): consulta HTML da COFEPRIS, ~590 páginas de 20 (horas por execução); só plaguicidas agrícolas
  vigentes. `node mx/build.mjs <pasta>` guarda cada página e retoma de onde parou.
- **Grécia** (`gr/`): download da base dbSYSPEST pelo portal 1Click (requisições ZK simples, sem navegador) e
  `mdb-export`; produtos de uso profissional segundo as instruções do ministério que vêm no ZIP.

## Atualização

Toda quarta-feira o workflow `weekly catalogs` roda cada país separadamente: baixa a fonte, reduz a lista e faz commit
só quando ela mudou. Se a fonte estiver fora do ar, se o layout mudar ou se vierem poucos produtos, aquele país falha e
a lista publicada continua a anterior; os outros seguem.

Localmente: `node us/build.mjs`, `node fr/build.mjs`, `node it/build.mjs` (cada um aceita um arquivo/pasta já baixado);
testes: `node --test`.

## Aviso

Estas listas são derivações para facilitar a digitação. Não são recomendação de uso, não substituem o rótulo nem a
decisão de autorização, e não indicam se um produto pode ser aplicado numa cultura, num estado/região ou por drone fora
das listas oficiais citadas.

Código: MIT. Dados: das fontes acima, com a atribuição exigida pelas licenças.
