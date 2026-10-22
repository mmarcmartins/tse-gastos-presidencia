# Gastos públicos: Lula, Jair Bolsonaro e Flávio Bolsonaro

Página: **https://mmarcmartins.github.io/tse-gastos-presidencia/**

## Propósito

Reunir, num só lugar e com tom neutro, os maiores gastos de dinheiro público ligados ao cargo de cada um, a partir dos portais oficiais de transparência, no contexto do 2º turno da eleição presidencial de 25/10/2026. A página mostra duas comparações:

- **Lula – Jair** (principal): o cartão de pagamento da Presidência da República nos mandatos de Lula (2023–2026) e de Jair Bolsonaro (2019–2022), ano a ano de mandato (2023 com 2019, 2024 com 2020…). É a mesma fonte e o mesmo órgão, então a comparação é direta. No ano em andamento, os dois lados usam só os meses já publicados.
- **Lula – Flávio** (secundária): o cartão da Presidência ao lado da cota parlamentar do senador Flávio Bolsonaro, de 2023 a 2026. Os dois gastos **não são comparáveis**, e a página avisa isso.

Para cada um, aparecem os 10 maiores gastos do ano, os gastos sigilosos, os totais e os gastos por mês. Os valores são nominais, sem correção pela inflação.

São dados de gastos ligados ao cargo, **não** das contas pessoais de ninguém.

## Fontes

| Dado | Fonte | Formato |
|---|---|---|
| Cartão de pagamento da Presidência (Lula e Jair) | [Portal da Transparência: arquivos mensais do CPGF](https://portaldatransparencia.gov.br/download-de-dados/cpgf) | ZIP com CSV, um por mês, filtrado pelo órgão superior 20000 (Presidência da República, incluindo EBC e Imprensa Nacional) |
| Cota parlamentar do Flávio Bolsonaro | [Senado Federal: dados abertos da CEAPS](https://adm.senado.gov.br/adm-dadosabertos/api/v1/senadores/despesas_ceaps/2026) | API JSON, um endereço por ano, filtrado pelo código do senador (5894) |

Os 10 maiores gastos do Portal são agrupados por unidade, portador e favorecido, como na [consulta do próprio Portal](https://portaldatransparencia.gov.br/cartoes/consulta?ordenarPor=valorTotal&direcao=desc&de=01/01/2026&ate=31/12/2026&orgaos=OS20000).

## Privacidade

- Nenhum nome ou CPF de servidor, portador do cartão, assessor ou passageiro é publicado. Nas passagens do Senado, só aparece se o passageiro era o próprio senador ou outra pessoa.
- Favorecidos pessoa física aparecem como "Pessoa física". Empresas individuais que levam o nome do dono aparecem como "Empresa individual (nome omitido)".
- O cache mensal (`data/cpgf/`) guarda só resumos já tratados. A chave de agrupamento é um hash, não o nome do portador.
- A página não inclui dados bancários, fiscais ou telefônicos pessoais de ninguém.

## Como funciona

```
data/gastos.json   ← scripts/atualizar.js  (baixa Senado + Portal)
data/cpgf/*.json   ← cache mensal do Portal (cada mês é baixado uma única vez)
src/index.pug      → build.js → dist/index.html (+ dist/gastos.json)
```

O workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) faz tudo no GitHub Actions:

1. roda `scripts/atualizar.js`, que atualiza `data/gastos.json` e o cache;
2. salva os dados no repositório;
3. gera a página com Pug;
4. publica no GitHub Pages.

Ele roda:

- a cada push no `main`;
- todo dia às 8h de Brasília, até 26/10/2026;
- manualmente, por `workflow_dispatch`.

O Portal da Transparência bloqueia (403/405) muitos downloads seguidos. Por isso cada execução baixa no máximo 18 meses novos e para no primeiro bloqueio, e a execução seguinte continua de onde parou. Um ano fechado só aparece quando os 12 meses estão baixados.

## Rodar localmente

Requer Node.js 22 ou mais recente.

```sh
npm install
npm run atualizar   # baixa os dados (opcional: node scripts/atualizar.js --todos)
npm run build       # gera dist/index.html
```

Para forçar uma atualização no GitHub:

```sh
gh workflow run pages.yml -R mmarcmartins/tse-gastos-presidencia
```

## Limitações

- Os gastos ligados diretamente ao presidente e ao vice são classificados como sigilosos pelo Portal e aparecem só como um valor total, sem detalhes.
- O Portal publica os meses com atraso, e o mês corrente do Senado ainda pode receber lançamentos.
- Os nomes de órgãos e empresas vêm dos arquivos oficiais, com ajuste de maiúsculas e minúsculas. Os arquivos não dizem o motivo de cada compra.
