# Conformidade do emissor

Esta página compara a DPS que o `src/dps.ts` monta com as regras de negócio do Anexo I, nas versões da produção
(9/2/2026) e da produção restrita (20/10/2026).

## O que a DPS leva

| Campo | O que o emissor envia | Regras conferidas |
|---|---|---|
| `tpAmb` | `1` na produção e `2` na produção restrita. | E0006 |
| `dhEmi` | A hora de Brasília, um minuto atrás do relógio do servidor. | E0008 |
| `serie` | `DPS_SERIES`. | E0010: pela API, a série vai de 1 a 49999. |
| `nDPS` | Um contador que nunca se repete. | E0014: se o número já foi usado, o emissor passa para o próximo. |
| `dCompet` | O `competence` do pedido ou a data de hoje. | E0015 e E0016 |
| `tpEmit` | `1`: o emitente é o prestador. | E9996 |
| `cLocEmi` | `ISSUER_CITY_CODE`. | E0037, E0038, E0039, E0041 e E0084 |
| `prest/CNPJ` | `ISSUER_CNPJ`. | E0080 e E0082 |
| `prest/IM` | `ISSUER_MUNICIPAL_SUBSCRIPTION`, quando preenchida. | E0116 e E0120 |
| `regTrib/opSimpNac` | `ISSUER_SIMPLES_OPTION`. | E0160 |
| `regTrib/regApTribSN` | `ISSUER_SIMPLES_APURATION`, só para ME/EPP. | E0162 e E0166 |
| `regTrib/regEspTrib` | `0`: nenhum regime especial. | E0174 e E0175 |
| `toma` | CPF ou CNPJ, nome e e-mail. Sem endereço. A nota também pode sair sem tomador. | E0188, E0190, E0202, E0207, E0234 e E0247 |
| `serv/locPrest/cLocPrestacao` | Sempre o município do prestador. | E0302 |
| `cServ/cTribNac` | O `serviceCode` do pedido. | E0310 e E0312 |
| `cServ/cNBS` | O `nbsCode` do pedido, quando informado. | E0316 |
| `cServ/xDescServ` | A `description` do pedido, com até 2.000 caracteres. | |
| `valores/vServPrest/vServ` | O `valueCents` do pedido, em reais. | |
| `tribMun/tribISSQN` | `1`: operação tributável. | E0540 |
| `tribMun/tpRetISSQN` | `1`: ISSQN não retido. | E0583 |
| `tribMun/pAliq` | Não é enviado. | E0600, E0617, E0625 e E0635 |
| `totTrib` | `pTotTribSN` para ME/EPP e `indTotTrib` igual a `0` para os demais. | E0710, E0712 e E0713 |

Na produção restrita, a DPS leva também `finNFSe` igual a `0`, e o `cNBS` vem antes da descrição, como pede o leiaute
da Nota Técnica nº 009.

## Serviços cobertos

O emissor informa sempre o município do prestador como local da prestação, sem endereço do tomador e sem os grupos de
obra e de evento. Pela tabela de incidência do Anexo I, que tem 337 códigos nacionais, isso dá:

| Códigos | Onde o ISSQN é devido | Situação |
|---|---|---|
| 272 | No município do prestador. | Funcionam. O local da prestação informado é sempre o município do prestador. |
| 31 | No local da prestação: itens 3.04, 3.05, 7.09 a 7.12, 7.16, 7.18, 11.01, 11.02, 11.04, 14.14.01, 14.14.02, 16.01, 16.02, 17.10, 20 e 22.01. | Funcionam só quando o serviço é prestado no município do prestador. |
| 13 | Obras: 7.02, 7.04, 7.05, 7.06, 7.07, 7.08, 7.17, 7.19, 14.14.03 e 14.14.04. | Não funcionam: a DPS exige o grupo `obra` (regra E0370). |
| 19 | Eventos: todos os códigos do item 12. | Não funcionam: a DPS exige o grupo `atvEvento` (regra E0390). |
| 1 | Fornecimento de mão de obra: 17.05.01, devido no município do tomador. | Não funciona: a DPS exige o endereço do tomador (regra E0234). |
| 1 | Serviços sem incidência de ISSQN e ICMS: 99.01.01. | Não funciona: a DPS precisa informar "não incidência" (regra E0532). |

Além do código nacional, o município precisa ter o serviço parametrizado como tributável. Veja
[O que cada município define](regras-municipais.md#lista-de-serviços).

## O que o emissor não faz

- Retenção do ISSQN pelo tomador ou pelo intermediário.
- Imunidade, isenção, exportação de serviço e não incidência.
- Regime especial de tributação, benefício municipal, dedução, redução e desconto.
- Tributos federais destacados na nota (PIS, Cofins, CSLL, IRRF e contribuição previdenciária).
- IBS e CBS (grupo `IBSCBS`).
- Código de tributação municipal (`cTribMun`).
- Endereço do tomador, tomador no exterior e intermediário.
- Serviço prestado em outro município ou no exterior.
- Substituição de nota e solicitação de análise fiscal para cancelamento.
- Nota emitida por pessoa física, pelo tomador ou pelo intermediário.

## Lacunas conhecidas

Pontos em que o emissor diverge das regras, encontrados na pesquisa de 13/11/2026:

| Lacuna | Efeito | Situação |
|---|---|---|
| O `"ok": true` do `/health?deep=1` só confere se o governo respondeu sobre o município. | Ele não avisa quando o município usa sistema próprio ou ainda não liberou a empresa. | Aberta. Leia os campos de `cityAgreement`, como explica [Municípios](municipios.md#como-conferir-o-seu-município). |

## O que vem pela frente

| Mudança | Quando | Efeito no emissor |
|---|---|---|
| Leiaute da Nota Técnica nº 009 na produção | "Nas próximas semanas", segundo as perguntas frequentes de 6/11/2026. | A produção passa a pedir o que a produção restrita já pede. O emissor já monta as duas formas, escolhidas por `NFSE_ENVIRONMENT`: quando a produção mudar, o `src/dps.ts` precisa enviar a ela a forma nova. |
| Campos `regApIBSCBSSN` e `cAtvSN` obrigatórios para ME/EPP | Sem data. As regras estão no Anexo VI da Nota Técnica nº 009, ainda sem código de erro. | O emissor não envia esses campos. Quando as regras entrarem, as notas de ME/EPP seriam recusadas. |
| IBS e CBS para os optantes pelo Simples Nacional | 1º/1/2027. | O emissor não monta o grupo `IBSCBS`. |

## O que já foi testado

| Caso | Testes automatizados | Produção |
|---|---|---|
| ME/EPP, com o ISS apurado pelo Simples | DPS validada contra os XSDs da produção e da produção restrita; assinatura conferida com o `xmlsec1`. | Sim. |
| MEI | DPS validada contra os dois XSDs, com os campos que as regras pedem do MEI. | Não. |
| ME/EPP, com o ISS apurado fora do Simples | A configuração é validada. | Não. |
| Empresa fora do Simples | A configuração recusa `ISSUER_SIMPLES_OPTION` igual a `1` (regra E0713). | Não. |
| Município com sistema próprio, depois de 1º/11/2026 | Não se aplica. | Não confirmado. |

Se você emitir em algum desses casos, conte o resultado numa
[issue](https://github.com/gabrielbuzziv/emissor-nfse-nacional/issues): isso ajuda a completar esta tabela.
