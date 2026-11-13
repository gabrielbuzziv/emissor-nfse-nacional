# Municípios, regimes e regras da NFS-e Nacional

O leiaute da NFS-e Nacional é um só para o país inteiro, mas três coisas mudam de uma empresa para outra: o **regime
tributário** de quem emite, o **município** onde a empresa está e o **serviço** prestado. Esta documentação explica
cada uma delas e mostra o que este emissor cobre.

A pesquisa foi feita em 13/11/2026, nas fontes oficiais listadas no fim desta página. Os números de municípios vêm da
planilha oficial de 10/11/2026. As regras mudam com frequência: confira a data de cada fonte antes de decidir.

## Resposta rápida

| Quem emite | Onde o Emissor Nacional vale | Este emissor |
|---|---|---|
| ME ou EPP do Simples Nacional, com o ISS apurado pelo Simples | Em todos os municípios com convênio ativo: 5.545 dos 5.571 da planilha oficial. Desde 1º/11/2026, é obrigatório, mesmo onde a prefeitura tem sistema próprio. | Atende. Já emite em produção. |
| MEI | Em todos os municípios, com ou sem convênio. É obrigatório desde 1º/9/2023. | Atende pelas regras oficiais. Ainda não foi testado em produção. |
| ME ou EPP do Simples Nacional, com o ISS apurado fora do Simples | Só nos municípios que usam os emissores nacionais: 3.495. | Aceita a configuração. Ainda não foi testado. |
| Empresa fora do Simples (Lucro Presumido, Lucro Real) | Só nos municípios que usam os emissores nacionais e já liberaram o contribuinte. | Não atende. |

Em qualquer caso, o emissor cobre o serviço prestado no município do prestador, tributado pelo ISSQN e sem retenção.
Os detalhes estão em [Conformidade do emissor](conformidade.md).

## Páginas

- [Quem pode usar](quem-pode-usar.md): MEI, ME/EPP e empresas fora do Simples, e o que muda em 2027.
- [Municípios](municipios.md): convênio, emissor nacional ou sistema próprio, números por estado e como conferir o
  seu município.
- [O que cada município define](regras-municipais.md): serviços, alíquotas, inscrição municipal, retenção,
  cancelamento e substituição.
- [Conformidade do emissor](conformidade.md): o que a DPS leva, os serviços cobertos e as lacunas conhecidas.
- [Rejeições](rejeicoes.md): os erros ligados a município e regime, e o que fazer em cada um.

## Como a pesquisa foi feita

- Lemos as planilhas oficiais de regras de negócio (Anexo I, da DPS e da NFS-e, e Anexo II, dos eventos), nas versões
  da produção e da produção restrita. São mais de 400 regras, e cada uma foi comparada com a DPS que o `src/dps.ts`
  monta.
- Cruzamos as regras com as normas (Resolução CGSN nº 191/2026, Ato Conjunto RFB/CGIBS nº 4/2026), com o guia do
  Painel Administrativo Municipal e com as perguntas frequentes do portal.
- Calculamos os números de municípios a partir da planilha oficial de adesões.

O que não foi possível conferir:

- As APIs do governo só respondem com certificado digital. Por isso, não consultamos a parametrização de cada
  município nem a documentação interativa (Swagger).
- Em produção, o emissor só foi usado por uma ME/EPP do Simples Nacional. O que esta documentação diz sobre os outros
  casos vem da leitura das regras, não de notas emitidas.
- A exceção que libera ME/EPP nos municípios com sistema próprio (regra E0039) aparece na planilha da produção
  restrita de 20/10/2026. A planilha da produção publicada no portal é de 9/2/2026 e ainda não traz essa exceção.

## Fontes

Portal da NFS-e:

- [Documentação atual da produção](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual):
  Anexo I (leiaute e regras da DPS e da NFS-e, de 9/2/2026), Anexo II (eventos, de 22/1/2026), manual das APIs para
  contribuintes e guia do Painel Administrativo Municipal (versão 1.2, de outubro de 2025).
- [Documentação da produção restrita](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita):
  Anexos I e II de 20/10/2026.
- [Documentação da reforma tributária](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc): Nota Técnica
  nº 009 (versão 1.01) e Anexo VI (versão 1.04.01).
- [Atualizações e implantações](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/atualizacoes-e-implantacoes).
- [Monitoramento das adesões](https://www.gov.br/nfse/pt-br/municipios/monitoramento-adesoes): planilha de municípios
  de 10/11/2026.
- [Perguntas frequentes](https://www.gov.br/nfse/pt-br/perguntas-frequentes): versão 1.3, de 6/11/2026.
- [Nota Técnica 2023.001](https://www.gov.br/nfse/pt-br/nt-2023-001-obrigatoriedade-da-nfs-e-nacional-para-o-mei.pdf):
  emissão da NFS-e pelo MEI.

Normas:

- [Resolução CGSN nº 191, de 4/8/2026](http://www.in.gov.br/en/web/dou/-/resolucao-cgsn-n-191-de-4-de-agosto-de-2026-724399487):
  ME e EPP do Simples Nacional no Emissor Nacional a partir de 1º/11/2026.
- [Resolução CGSN nº 169, de 27/7/2022](http://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=125242):
  MEI no padrão nacional.
- [Ato Conjunto RFB/CGIBS nº 4, de 30/7/2026](https://www.cgibs.gov.br/upload/arquivos/202607/31091735-20260730-16h30-ato-conjunto-rfb-cgibs-na-c2-ba-4-260731-090909.pdf):
  datas de início do destaque do IBS e da CBS nos documentos fiscais.

Prefeituras:

- [Prefeitura de São Paulo: uso do Emissor Nacional](https://prefeitura.sp.gov.br/web/fazenda/w/usoemissornacional).
