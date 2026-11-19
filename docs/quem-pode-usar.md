# Quem pode usar

O regime tributário do prestador decide duas coisas: se ele pode (ou deve) emitir pelo Emissor Nacional e o que a DPS
precisa levar. Este emissor usa a API do Emissor Nacional, que exige certificado digital em qualquer regime.

## MEI

**Funciona pelas regras oficiais, mas ainda não foi testado em produção.**

- Desde 1º/9/2023, o MEI emite a NFS-e só pelo Emissor Nacional: pela web, pelo aplicativo ou pela API
  ([Resolução CGSN nº 169/2022](http://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=125242) e
  [Nota Técnica 2023.001](https://www.gov.br/nfse/pt-br/nt-2023-001-obrigatoriedade-da-nfs-e-nacional-para-o-mei.pdf)).
- Vale em qualquer município, com ou sem convênio: as regras E0016, E0037, E0038 e E0039, que conferem o convênio do
  município, não se aplicam ao MEI.
- Pela web e pelo aplicativo, o MEI entra com a conta gov.br. Pela API, a nota técnica exige o certificado digital
  (e-CNPJ) do próprio MEI. Este emissor usa a API, então o MEI precisa de um e-CNPJ A1.
- O município informado em `ISSUER_CITY_CODE` precisa ser o do endereço do MEI no CNPJ (regra E0041).

Para o MEI, configure `ISSUER_SIMPLES_OPTION` como `2` e deixe `ISSUER_SIMPLES_APURATION` e
`ISSUER_SIMPLES_TOTAL_TAX_PERCENT` como estão: eles só valem para ME/EPP. A DPS sai assim:

| Campo | Valor | Regra |
|---|---|---|
| `opSimpNac` | `2` | E0160: precisa bater com o cadastro do Simples na data de competência. |
| `regApTribSN` | Não é enviado. | E0162 |
| `regEspTrib` | `0` | E0174 |
| `tpRetISSQN` | `1` (não retido) | E0583: nota de MEI nunca tem retenção de ISSQN. |
| `pAliq` | Não é enviado. | E0600 |
| `totTrib` | `indTotTrib` igual a `0` | E0710: o MEI não informa a alíquota do Simples. |

O MEI continua sujeito ao prazo de cancelamento definido pela prefeitura (regra E0822).

## ME e EPP do Simples Nacional

**Funciona e já emite em produção.**

- Desde 1º/11/2026, a ME ou a EPP optante pelo Simples Nacional emite a nota de serviço só pelo Emissor Nacional, pela
  web ou pela API
  ([Resolução CGSN nº 191/2026](http://www.in.gov.br/en/web/dou/-/resolucao-cgsn-n-191-de-4-de-agosto-de-2026-724399487)).
  Os sistemas próprios das prefeituras não podem mais autorizar essas notas.
- A nota vale em todo o país. A prefeitura continua a receber os dados, pelo Painel Municipal.
- A nota do Simples não mostra o valor do ISS: ele é apurado no PGDAS-D, sobre o faturamento do mês.

O que conferir:

| Ponto | O que acontece |
|---|---|
| Convênio do município | Precisa estar ativo (regras E0037 e E0038). Em 10/11/2026, 26 municípios não estavam; veja a lista em [Municípios](municipios.md#convênio-não-ativo). |
| Prefeitura com sistema próprio | A regra E0039 libera a ME/EPP com o ISS apurado pelo Simples (`ISSUER_SIMPLES_APURATION` igual a `1`) para competências a partir de 1º/11/2026. Antes dessa data, a nota é recusada. |
| ISS apurado fora do Simples (`ISSUER_SIMPLES_APURATION` igual a `2` ou `3`) | A exceção da regra E0039 não cita esse caso. Pela planilha de regras, a emissão depende de o município usar os emissores nacionais. O emissor aceita a configuração, mas esse caso não foi testado. |
| Alíquota do Simples (`ISSUER_SIMPLES_TOTAL_TAX_PERCENT`) | Use a alíquota nominal da faixa de faturamento atual, não a efetiva. É o que orientam as perguntas frequentes do portal (assunto 20.5). |

## Empresas fora do Simples

**Ainda não funciona.** Vale para Lucro Presumido, Lucro Real e qualquer empresa não optante.

1. **A nota seria recusada.** Para o não optante, o grupo `totTrib` precisa trazer os tributos aproximados em valor
   (`vTotTrib`) ou em percentual (`pTotTrib`). O emissor envia `indTotTrib`, que a regra E0713 proíbe nesse regime.
2. **Falta o IBS e a CBS.** O
   [Ato Conjunto RFB/CGIBS nº 4/2026](https://www.cgibs.gov.br/upload/arquivos/202607/31091735-20260730-16h30-ato-conjunto-rfb-cgibs-na-c2-ba-4-260731-090909.pdf)
   tornou o destaque obrigatório na NFS-e a partir de 1º/10/2026, para a maioria dos serviços, e de 1º/12/2026, para os
   demais. Até 31/12/2026, a falta do grupo não recusa a nota, mas deixa o emitente em desconformidade. O emissor não
   monta o grupo `IBSCBS`.
3. **Depende do município.** Fora do Simples, a empresa só emite pelo Emissor Nacional onde a prefeitura usa os
   emissores nacionais e já liberou o contribuinte. Nos outros municípios, ela emite no sistema da prefeitura.

Por esses motivos, a configuração recusa `ISSUER_SIMPLES_OPTION` igual a `1`.

## Outros casos

| Caso | Situação |
|---|---|
| Pessoa física (profissional autônomo, com CPF) | Não funciona: o emissor identifica o prestador só pelo CNPJ. |
| Nota emitida pelo tomador ou pelo intermediário | Não funciona. O próprio Sistema Nacional ainda recusa essas notas (regra E9996). |
| Locação e outras operações do item 99 | Não funciona: elas exigem o grupo `IBSCBS`. |

## O que muda em 2027

Dois pontos atingem também quem é do Simples Nacional, e o emissor ainda não está pronto para eles:

- **IBS e CBS.** Para os optantes pelo Simples Nacional, a obrigatoriedade começa em 1º/1/2027 (Ato Conjunto RFB/CGIBS
  nº 4/2026, art. 1º, § 1º). O leiaute confirma: para os optantes, os grupos `IBSCBS` passam a ser obrigatórios a
  partir de 2027.
- **Campos novos do Simples.** O leiaute da
  [Nota Técnica nº 009](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/nota-tecnica-009-se-cgnfs-e-v-1-01.pdf)
  cria, para a ME/EPP, os campos `regApIBSCBSSN` (regime de apuração do IBS e da CBS) e `cAtvSN` (código da atividade
  no Simples), os dois obrigatórios, e a situação `4` (optante pendente) em `opSimpNac`. Essas regras ainda não têm
  código de erro nem data de entrada em produção; o portal vai publicar o cronograma.

Quando essas mudanças entrarem em produção, o `src/dps.ts` precisa acompanhar.
