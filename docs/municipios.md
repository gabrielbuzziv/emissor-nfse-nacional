# Municípios

Todos os 5.571 municípios da planilha oficial aderiram ao convênio da NFS-e Nacional. Isso não quer dizer que todos
emitem pelo Emissor Nacional: cada prefeitura escolhe entre os emissores nacionais e um sistema próprio.

## Convênio não é emissor nacional

Um município pode estar em três situações:

| Situação | Como as empresas emitem |
|---|---|
| Convênio ativo, com os emissores nacionais | Direto no Emissor Nacional: web, aplicativo ou API. É a API que este emissor usa. |
| Convênio ativo, com sistema próprio | No sistema da prefeitura, que depois compartilha as notas com o Ambiente de Dados Nacional (ADN). |
| Convênio não ativo | A prefeitura ainda não concluiu a parametrização. Só o MEI emite pelo Emissor Nacional. |

A escolha é uma pergunta na configuração do convênio, no Painel Administrativo Municipal: "O município irá utilizar os
Emissores Públicos Nacionais (API, Móvel e Web)?". Quando a resposta é "Não", a regra E0039 recusa a DPS enviada pela
API, com as exceções da tabela abaixo.

## Quem emite onde

| Prestador | Município com os emissores nacionais | Município com sistema próprio | Convênio não ativo |
|---|---|---|---|
| MEI | Emissor Nacional | Emissor Nacional | Emissor Nacional |
| ME/EPP, com o ISS apurado pelo Simples | Emissor Nacional | Emissor Nacional, para competências a partir de 1º/11/2026 | Recusado (regra E0038) |
| ME/EPP, com o ISS apurado fora do Simples | Emissor Nacional | Sistema da prefeitura: a exceção da regra E0039 não cita esse caso | Recusado (regra E0038) |
| Empresa fora do Simples | Emissor Nacional, se a prefeitura já liberou o contribuinte | Sistema da prefeitura | Recusado (regra E0038) |

As bases são a Resolução CGSN nº 169/2022 (MEI), a Resolução CGSN nº 191/2026 (ME/EPP) e as regras E0037, E0038 e
E0039 do Anexo I. Veja [Quem pode usar](quem-pode-usar.md) para o que este emissor atende em cada linha.

A locação e as outras operações do item 99 da lista de serviços vão sempre para o Emissor Nacional, em qualquer
município. Este emissor não atende essas operações.

## Adoção faseada

O município que usa os emissores nacionais pode migrar aos poucos. A prefeitura controla, contribuinte por
contribuinte, quem já emite pelo Emissor Nacional e a partir de qual data:

- **Situação padrão**: a prefeitura define se as empresas do município já vêm habilitadas ou não.
- **Autorização individual**: a prefeitura registra, no Cadastro Nacional de Contribuintes (CNC), a data em que cada
  contribuinte passa a emitir pelo Emissor Nacional.
- **Exclusividade**: numa mesma competência, o contribuinte emite por um sistema só.

Por isso, um município que aparece com "Sim" na planilha pode ainda não ter liberado a sua empresa. São Paulo é um
exemplo: a [prefeitura](https://prefeitura.sp.gov.br/web/fazenda/w/usoemissornacional) tornou o Emissor Nacional
obrigatório para profissionais liberais e autônomos em 3/8/2026 e para as empresas do Simples Nacional em 1º/11/2026.

Essa trava não atinge o MEI nem, desde 1º/11/2026, a ME/EPP com o ISS apurado pelo Simples.

## Números

Planilha oficial de 10/11/2026:

| Situação | Municípios | População |
|---|---|---|
| Convênio ativo, com os emissores nacionais | 3.495 | 63,8% |
| Convênio ativo, com sistema próprio | 2.050 | 36,0% |
| Convênio não ativo | 26 | 0,1% |
| Total | 5.571 | 100% |

Dos 48 municípios com mais de 500 mil habitantes, 29 usam os emissores nacionais.

### Capitais

| Situação | Capitais |
|---|---|
| Com os emissores nacionais (16) | Belo Horizonte, Boa Vista, Brasília, Cuiabá, Curitiba, Florianópolis, Goiânia, Manaus, Natal, Porto Alegre, Recife, Rio Branco, Rio de Janeiro, São Luís, São Paulo e Vitória |
| Com sistema próprio (11) | Aracaju, Belém, Campo Grande, Fortaleza, João Pessoa, Macapá, Maceió, Palmas, Porto Velho, Salvador e Teresina |

Outros municípios grandes com sistema próprio: Guarulhos, Campinas, Duque de Caxias, São Bernardo do Campo, Sorocaba,
Ribeirão Preto, Jaboatão dos Guararapes, Feira de Santana, Campos dos Goytacazes e Vila Velha.

### Por estado

| UF | Municípios | Com os emissores nacionais | População do estado nesses municípios |
|---|---|---|---|
| AC | 22 | 11 | 65% |
| AL | 102 | 72 | 47% |
| AM | 62 | 40 | 80% |
| AP | 16 | 11 | 29% |
| BA | 417 | 187 | 34% |
| CE | 184 | 87 | 27% |
| DF | 1 | 1 | 100% |
| ES | 78 | 36 | 53% |
| GO | 246 | 133 | 67% |
| MA | 217 | 111 | 64% |
| MG | 853 | 611 | 79% |
| MS | 79 | 66 | 59% |
| MT | 142 | 114 | 93% |
| PA | 144 | 116 | 73% |
| PB | 223 | 73 | 18% |
| PE | 185 | 74 | 35% |
| PI | 224 | 130 | 49% |
| PR | 399 | 239 | 80% |
| RJ | 92 | 54 | 79% |
| RN | 167 | 85 | 47% |
| RO | 52 | 39 | 52% |
| RR | 15 | 9 | 89% |
| RS | 497 | 356 | 69% |
| SC | 295 | 253 | 86% |
| SE | 75 | 39 | 22% |
| SP | 645 | 493 | 69% |
| TO | 139 | 55 | 20% |

### Convênio não ativo

Nestes 26 municípios, em 10/11/2026, só o MEI emitia pelo Emissor Nacional:

| UF | Municípios |
|---|---|
| AM | Fonte Boa |
| AP | Amapá |
| BA | Aporá |
| MA | Bernardo do Mearim, Cachoeira Grande, Conceição do Lago-Açu, Icatu, Jenipapo dos Vieiras, Junco do Maranhão, Lajeado Novo, Milagres do Maranhão, Olinda Nova do Maranhão, Pirapemas, Ribamar Fiquene, Santa Filomena do Maranhão e Satubinha |
| PA | Chaves |
| PI | Barreiras do Piauí, Morro Cabeça no Tempo, Paes Landim, Patos do Piauí e São José do Peixe |
| PR | Cantagalo |
| RS | Cristal do Sul |
| SE | Brejo Grande e Gararu |

## Como conferir o seu município

1. **Na planilha oficial.** Baixe a lista de municípios na página de
   [monitoramento das adesões](https://www.gov.br/nfse/pt-br/municipios/monitoramento-adesoes) e procure o seu:

   | Coluna | O que diz |
   |---|---|
   | `StatusConvenioSEFIN` | "Conveniado Ativo" ou "Conveniado - Nao Ativo". |
   | `AderenteAmbienteNacional` | Se o município compartilha as notas com o ADN. |
   | `AderenteEmissorNacional` | Se o município usa os emissores nacionais. É a coluna que importa para quem não é MEI nem ME/EPP do Simples. |
   | `AderenteMAN` | Se o município usa o Módulo de Apuração Nacional, que gera a guia do ISS. |

2. **No emissor.** Depois da instalação, chame o `/health?deep=1`. O campo `cityAgreement` traz a resposta da API de
   parâmetros municipais para o seu município. Procure nela:

   | Campo | O que diz |
   |---|---|
   | `aderenteEmissorNacional` | `1`: o município usa os emissores nacionais. `0`: usa sistema próprio. |
   | `situacaoEmissaoPadraoContribuintesRFB` | `1`: toda empresa com endereço no município já está habilitada. `0`: a prefeitura precisa cadastrar cada contribuinte no CNC, com a data de autorização. |
   | `permiteAproveitamentoDeCreditos` | Só afeta a apuração do ISS no Módulo de Apuração Nacional. |

   O `"ok": true` do `/health?deep=1` diz que o governo aceitou o certificado e respondeu sobre o município. Ele não
   diz que a sua empresa já pode emitir.

3. **Com uma nota.** A confirmação final é emitir. A produção restrita não tem todos os municípios; se o seu não estiver
   lá, a primeira nota real é o teste.

Se a nota for recusada, veja [Rejeições](rejeicoes.md).
