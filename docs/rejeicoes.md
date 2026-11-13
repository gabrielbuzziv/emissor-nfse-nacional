# Rejeições

Quando o governo recusa uma nota, o `POST /v1/notas` responde 422, com os erros em `errors`. Esta página reúne as
rejeições ligadas a município, regime e serviço. Os códigos e os textos vêm do Anexo I e do Anexo II da
[documentação técnica](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual).

Depois de corrigir a causa, envie o mesmo pedido de novo, com o mesmo `id`.

## Município e convênio

| Código | O que quer dizer | O que fazer |
|---|---|---|
| E0037 | O município não está no cadastro de convênio do Sistema Nacional. Não se aplica ao MEI. | Confira o `ISSUER_CITY_CODE`. Se estiver certo, a emissão depende da prefeitura. |
| E0038 | O convênio do município não está ativo. Não se aplica ao MEI. | Espere a prefeitura concluir a ativação. Veja a lista em [Municípios](municipios.md#convênio-não-ativo). |
| E0039 | O município não usa os emissores nacionais. Não se aplica ao MEI nem, para competências a partir de 1º/11/2026, à ME/EPP com o ISS apurado pelo Simples. | Confira o regime configurado e a data de competência. Fora dessas exceções, a nota sai pelo sistema da prefeitura. |
| E0016 | A data de competência é anterior à ativação do convênio do município. Não se aplica ao MEI. | Use uma competência posterior à ativação. |
| E0025 | A data de competência é anterior à data em que a prefeitura autorizou a empresa a usar os emissores nacionais. | Peça à prefeitura para conferir a data de autorização no cadastro (CNC). |
| E0041 | O município informado não é o do endereço do MEI no CNPJ. | Corrija o `ISSUER_CITY_CODE`. |
| E0084 | O CNPJ não tem estabelecimento no município informado, pelo cadastro da Receita ou pelo CNC. | Corrija o `ISSUER_CITY_CODE` ou peça à prefeitura para habilitar a empresa. |

## Cadastro e regime

| Código | O que quer dizer | O que fazer |
|---|---|---|
| E0116 | A prefeitura cadastrou a empresa no CNC, e a DPS foi sem a inscrição municipal. | Preencha `ISSUER_MUNICIPAL_SUBSCRIPTION` com a inscrição registrada pela prefeitura. |
| E0119 | A inscrição municipal informada não está autorizada a emitir. | Fale com a prefeitura. |
| E0120 | A DPS foi com a inscrição municipal, mas a empresa não está no CNC do município. | Deixe `ISSUER_MUNICIPAL_SUBSCRIPTION` vazio. |
| E0160 | A situação no Simples Nacional informada não bate com o cadastro do Simples na data de competência. | Corrija o `ISSUER_SIMPLES_OPTION`. Se a empresa mudou de regime, a competência define qual vale. |
| E0712 | Uma ME/EPP enviou `indTotTrib`. | Confira se `ISSUER_SIMPLES_OPTION` está como `3`. |
| E0713 | Uma empresa fora do Simples enviou `indTotTrib` ou `pTotTribSN`. | O emissor ainda não atende empresas fora do Simples. Veja [Quem pode usar](quem-pode-usar.md#empresas-fora-do-simples). |
| E0010 | A série da DPS está fora da faixa da API. | Use um `DPS_SERIES` de 1 a 49999. |

## Serviço

| Código | O que quer dizer | O que fazer |
|---|---|---|
| E0310 | O código de tributação nacional não existe na lista nacional. | Corrija o `serviceCode`. |
| E0312 | O município não tem o código parametrizado na data de competência. Não se aplica ao MEI. | Confira o código com o contador. Se estiver certo, a correção é da prefeitura, no Painel Municipal. |
| E0316 | O código NBS não existe na tabela do sistema. | Corrija o `nbsCode`. |
| E0540 | A prefeitura marcou o serviço como "não incidente", e a nota foi como tributável. | O emissor não emite nota de não incidência. Confira o código do serviço ou fale com a prefeitura. |
| E0532 | O código 99.01.01 só aceita "não incidência". | O emissor não atende esse código. |
| E0370 | O serviço é de obra e exige o grupo `obra`. | O emissor não atende esses códigos. Veja [Conformidade do emissor](conformidade.md#serviços-cobertos). |
| E0390 | O serviço é do item 12 (eventos) e exige o grupo `atvEvento`. | O emissor não atende esses códigos. |
| E0234 | O serviço é devido no município do tomador e exige o endereço dele. | O emissor não atende esse código. |

## Tomador

| Código | O que quer dizer | O que fazer |
|---|---|---|
| E0190 | O CNPJ do tomador não existe no cadastro da Receita. | Corrija o `taker.taxId`. |
| E0207 | O CPF do tomador não existe no cadastro da Receita. | Corrija o `taker.taxId`. |
| E0202 | O CNPJ do tomador é igual ao do prestador. | Uma empresa não emite nota para ela mesma. |
| E0247 | O e-mail do tomador é inválido. | Corrija o `taker.email` ou envie o pedido sem ele. |

## Cancelamento

No cancelamento, o `POST /v1/notas/:id/cancel` responde 422, com os erros em `cancelErrors`.

| Código | O que quer dizer | O que fazer |
|---|---|---|
| E0822 | O prazo de cancelamento definido pela prefeitura acabou. | Peça a análise fiscal pelo portal do Emissor Nacional ou fale com a prefeitura. |
| E0823 | O valor da nota passa do limite que a prefeitura aceita cancelar. | O mesmo caminho: análise fiscal ou prefeitura. |
| E0824 | A prefeitura não aceita cancelar nota sem tomador identificado. | O mesmo caminho: análise fiscal ou prefeitura. |
| E0827 | A prefeitura não aceita cancelar nota com tributos já recolhidos. | O mesmo caminho: análise fiscal ou prefeitura. |
| E0840 | Já existe um evento na nota que impede o cancelamento, como uma análise fiscal em andamento. | Espere a decisão da prefeitura. |

## Outras respostas

| Resposta | O que quer dizer | O que fazer |
|---|---|---|
| E0014 | O número da DPS já tem uma nota. | Nada: o emissor confere se a nota é a sua e, se não for, passa para o próximo número. |
| E1235 | A DPS não passou no esquema XML. | Costuma ser mudança de leiaute do governo. Abra uma [issue](https://github.com/gabrielbuzziv/emissor-nfse-nacional/issues) com o erro. |
| `HTTP 403` | O governo recusou o certificado. | Confira se ele é um e-CNPJ ICP-Brasil do prestador e se está na validade. |
