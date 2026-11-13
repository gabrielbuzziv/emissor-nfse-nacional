# O que cada município define

O Sistema Nacional separa as regras de negócio em três níveis: as do leiaute, as gerais, que valem para todos os
municípios, e as específicas, que seguem a legislação de cada município. As específicas não estão no código de nenhum
emissor: a prefeitura as registra no Painel Administrativo Municipal, e o governo as aplica quando recebe a DPS.

Por isso, a mesma DPS pode ser aceita num município e recusada em outro. Esta página lista o que a prefeitura define e
o que este emissor faz em cada ponto.

## Emissores nacionais e cadastro

| O que a prefeitura define | Efeito | O que o emissor faz |
|---|---|---|
| Se o município usa os emissores nacionais | Sem isso, a API recusa a DPS de quem não é MEI nem ME/EPP com o ISS apurado pelo Simples (regra E0039). | Nada: é uma condição do município. Veja [Municípios](municipios.md). |
| De onde vem o cadastro dos contribuintes: da Receita Federal ou do Cadastro Nacional de Contribuintes (CNC) | Com o cadastro da Receita, emite pelo município quem tem endereço nele no CNPJ (regra E0084). | Envia o município de `ISSUER_CITY_CODE`, que precisa ser o do CNPJ. |
| Se as empresas já vêm habilitadas ou se cada uma precisa de autorização | Sem autorização, a nota é recusada. Com autorização, a competência não pode ser anterior à data autorizada (regra E0025). | Nada: peça a liberação à prefeitura. |
| Registro da empresa no CNC, com a inscrição municipal | Se a empresa está no CNC, a inscrição municipal é obrigatória na DPS (regra E0116). Se não está, ela não pode ser enviada (regra E0120). | Envia `ISSUER_MUNICIPAL_SUBSCRIPTION` só quando preenchida. |
| Suspensão de um contribuinte | A prefeitura pode impedir a emissão de uma empresa (regras E0119 e E0124). | Devolve a recusa do governo. |

As regras do CNC (E0084, E0116 e E0119) não se aplicam ao MEI.

## Lista de serviços

A lista nacional em produção tem 337 códigos de 6 dígitos, derivados da lista da Lei Complementar nº 116/2003. Para
cada código, a prefeitura define:

| O que a prefeitura define | Efeito | O que o emissor faz |
|---|---|---|
| Quais códigos ela administra, e desde quando | O código precisa estar parametrizado na data de competência, ou a nota é recusada (regra E0312). Não se aplica ao MEI. | Envia o `serviceCode` do pedido. |
| Se o serviço tem incidência de ISSQN no município | Se a prefeitura marcou o código como "não incidente", a nota tributável é recusada (regra E0540). | Envia sempre "operação tributável". Nesse município, o código não funciona. |
| A alíquota | Com o convênio ativo e sem retenção, a alíquota não pode ser enviada na DPS (regras E0617, E0625 e E0635): o sistema usa a da parametrização ou, na ME/EPP com o ISS apurado pelo Simples, não calcula o ISS na nota. | Não envia alíquota. |
| Códigos de tributação municipal: 3 dígitos abaixo do código nacional | São desdobramentos que só existem naquele município. O campo é opcional; se enviado, precisa existir na parametrização (regra E0314). | Não envia. Se a prefeitura exigir o código municipal, o emissor não atende. |
| Deduções e reduções da base de cálculo permitidas | Só valem nos códigos em que a prefeitura as admitiu (regras E0446, E0449 e E0454). | Não envia deduções nem descontos. |

O local onde o ISSQN é devido não é escolha da prefeitura: vem da Lei Complementar nº 116/2003 e está na tabela de
incidência do Anexo I. Veja os serviços cobertos em [Conformidade do emissor](conformidade.md#serviços-cobertos).

## Retenção, regimes especiais e benefícios

| O que a prefeitura define | Efeito | O que o emissor faz |
|---|---|---|
| Quem deve reter o ISSQN: tomadores e serviços | Hoje a regra de retenção só alerta, não bloqueia: a nota sem retenção é aceita, e a prefeitura fiscaliza depois (perguntas frequentes, assunto 7.4). | Envia sempre "ISSQN não retido". Se a lei do município manda o tomador reter, o emissor não atende. |
| Regimes especiais de tributação: sociedade de profissionais, cooperativa, estimativa e outros | Só valem para os contribuintes e serviços que a prefeitura vinculou (regras E0177 e E0178). | Envia sempre "nenhum". |
| Benefícios municipais: isenção, redução de base de cálculo, alíquota diferenciada | O benefício precisa existir e estar vigente no município (regras E0541 a E0550). | Não envia benefício. |

O MEI e a ME/EPP com o ISS apurado pelo Simples não podem ter regime especial (regras E0174 e E0175), e o MEI nunca
tem retenção nem benefício (regras E0583 e E0534). Para o MEI, o que o emissor envia nesses três pontos é o único
valor aceito. Para a ME/EPP, a retenção pelo tomador continua possível, e o emissor não a faz.

## Cancelamento

| O que a prefeitura define | Efeito |
|---|---|
| Prazo máximo para cancelar | Depois do prazo, o cancelamento é recusado (regra E0822). Sem prazo definido, o limite é de 730 dias. |
| Valor máximo da nota que pode ser cancelada | Acima do valor, o cancelamento é recusado (regra E0823). |
| Se aceita cancelar nota sem tomador identificado | Se não aceita, o cancelamento é recusado (regra E0824). |
| Se aceita cancelar nota com tributos já recolhidos | Se não aceita, o cancelamento é recusado (regra E0827). |

Quando o cancelamento é recusado, o `POST /v1/notas/:id/cancel` responde 422, com o motivo em `cancelErrors`. O caminho
seguinte é a solicitação de análise fiscal, que a prefeitura aprova ou nega, ou o cancelamento de ofício, feito pela
própria prefeitura. Este emissor não envia a solicitação de análise fiscal: faça o pedido pelo portal do Emissor
Nacional ou direto à prefeitura.

Se você emite notas sem tomador, confira antes se o seu município aceita cancelá-las.

## Substituição

A prefeitura também define o prazo para substituir uma nota (regra E0050), se aceita substituir nota sem tomador
identificado (regra E0056) e se aceita trocar o tomador na nota substituta (regra E0058). Este emissor não faz
substituição.

## Fontes

- Anexo I e Anexo II da
  [documentação técnica](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual): regras de
  negócio da DPS, da NFS-e e dos eventos.
- [Guia do Painel Administrativo Municipal](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/guia-do-painel-administrativo-municipal-nfs-e-v1-2-out2025.pdf),
  versão 1.2: itens 3.3 (convênio), 3.4 (eventos), 3.5 (serviços) e 3.6 (contribuintes).
- [Perguntas frequentes](https://www.gov.br/nfse/pt-br/perguntas-frequentes), versão 1.3: temas 2, 5, 7, 9, 21 e 23.
