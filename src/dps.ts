/**
 * Builds the NFS-e Nacional documents (DPS and the cancellation event) as XML in canonical form, which
 * the container signs as is: no whitespace between tags, no self-closing tags, text escaped.
 */

export type Environment = 'production' | 'restricted'

export interface Issuer {
  cnpj: string
  /** IBGE code of the city where the CNPJ is established (cLocEmi). */
  cityCode: string
  /** Only when the city has the company in its complementary register (CNC); otherwise the DPS is rejected. */
  municipalSubscription?: string
  /** 1 = not opted in, 2 = MEI, 3 = ME/EPP. */
  simplesNacionalOption: '1' | '2' | '3'
  /** ME/EPP only: 1 = federal and municipal taxes through the Simples. */
  simplesNacionalApuration?: '1' | '2' | '3'
  /** ME/EPP only: approximate Simples Nacional rate shown on the nota (Lei 12.741), e.g. "6.00". */
  simplesNacionalTotalTaxPercent?: string
}

export interface Taker {
  /** CPF (11 digits) or CNPJ (14 digits). */
  taxId: string
  name: string
  email?: string
}

export interface DpsInput {
  environment: Environment
  issuer: Issuer
  series: string
  number: number
  issuedAt: Date
  /** Date the service was provided, YYYY-MM-DD; never after `issuedAt`. */
  competence: string
  taker?: Taker
  /** National service code (cTribNac), 6 digits, e.g. "080201". */
  serviceCode: string
  /** NBS code, 9 digits, e.g. "122051900". */
  nbsCode?: string
  description: string
  valueCents: number
}

export const NFSE_NS = 'http://www.sped.fazenda.gov.br/nfse'
const LAYOUT_VERSION = '1.01'
const APP_VERSION = 'emissor-nfse-1'
const TAX_ID_CNPJ = '2'

export const hosts = {
  production: { sefin: 'sefin.nfse.gov.br', adn: 'adn.nfse.gov.br' },
  restricted: { sefin: 'sefin.producaorestrita.nfse.gov.br', adn: 'adn.producaorestrita.nfse.gov.br' },
} as const satisfies Record<Environment, { sefin: string; adn: string }>

const escapeXml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const el = (name: string, content: string | readonly string[]): string =>
  `<${name}>${typeof content === 'string' ? escapeXml(content) : content.join('')}</${name}>`

/** The optional element only when `content` is present. */
const opt = (name: string, content: string | undefined): string => (content ? el(name, content) : '')

const digits = (text: string): string => text.replace(/\D/g, '')

/** Brasília time (UTC-3, no daylight saving since 2019) in the layout's format. */
export const brasiliaDateTime = (date: Date): string =>
  `${new Date(date.getTime() - 3 * 3_600_000).toISOString().slice(0, 19)}-03:00`

export const brasiliaDate = (date: Date): string => brasiliaDateTime(date).slice(0, 10)

/** "DPS" + city (7) + inscription type (1) + CNPJ (14) + series (5) + number (15). */
export const dpsId = (issuer: Issuer, series: string, number: number): string =>
  `DPS${issuer.cityCode}${TAX_ID_CNPJ}${digits(issuer.cnpj)}${series.padStart(5, '0')}${String(number).padStart(15, '0')}`

const centsToDecimal = (cents: number): string => (cents / 100).toFixed(2)

const takerXml = (taker: Taker): string => {
  const taxId = digits(taker.taxId)
  return el('toma', [
    el(taxId.length === 14 ? 'CNPJ' : 'CPF', taxId),
    el('xNome', taker.name.trim().slice(0, 300)),
    opt('email', taker.email?.trim().slice(0, 80)),
  ])
}

const totalTaxXml = (issuer: Issuer): string => {
  // ME/EPP must state the approximate Simples rate; MEI and non-opted-in cannot (rules E0710–E0713).
  if (issuer.simplesNacionalOption === '3') return el('totTrib', [el('pTotTribSN', issuer.simplesNacionalTotalTaxPercent ?? '0')])
  return el('totTrib', [el('indTotTrib', '0')])
}

export const buildDps = (input: DpsInput): { id: string; xml: string } => {
  const { issuer } = input
  const id = dpsId(issuer, input.series, input.number)
  const isMeEpp = issuer.simplesNacionalOption === '3'
  const description = input.description.trim().slice(0, 2000)
  const body = [
    el('tpAmb', input.environment === 'production' ? '1' : '2'),
    el('dhEmi', brasiliaDateTime(input.issuedAt)),
    el('verAplic', APP_VERSION),
    el('serie', input.series.padStart(5, '0')),
    el('nDPS', String(input.number)),
    el('dCompet', input.competence),
    el('tpEmit', '1'),
    // Produção restrita already runs the NT 009 layout (schema 1.02), which requires finNFSe here.
    input.environment === 'restricted' ? el('finNFSe', '0') : '',
    el('cLocEmi', issuer.cityCode),
    el('prest', [
      el('CNPJ', digits(issuer.cnpj)),
      opt('IM', issuer.municipalSubscription),
      el('regTrib', [
        el('opSimpNac', issuer.simplesNacionalOption),
        isMeEpp ? el('regApTribSN', issuer.simplesNacionalApuration ?? '1') : '',
        el('regEspTrib', '0'),
      ]),
    ]),
    input.taker ? takerXml(input.taker) : '',
    el('serv', [
      el('locPrest', [el('cLocPrestacao', issuer.cityCode)]),
      // Production (1.01) has cNBS after the description; produção restrita (NT 009) moved it before.
      el(
        'cServ',
        input.environment === 'production'
          ? [el('cTribNac', input.serviceCode), el('xDescServ', description), opt('cNBS', input.nbsCode)]
          : [el('cTribNac', input.serviceCode), opt('cNBS', input.nbsCode), el('xDescServ', description)],
      ),
    ]),
    el('valores', [
      el('vServPrest', [el('vServ', centsToDecimal(input.valueCents))]),
      el('trib', [el('tribMun', [el('tribISSQN', '1'), el('tpRetISSQN', '1')]), totalTaxXml(issuer)]),
    ]),
  ].join('')
  return {
    id,
    xml: `<?xml version="1.0" encoding="UTF-8"?><DPS xmlns="${NFSE_NS}" versao="${LAYOUT_VERSION}"><infDPS Id="${id}">${body}</infDPS></DPS>`,
  }
}

export interface CancellationInput {
  environment: Environment
  issuer: Issuer
  accessKey: string
  at: Date
  /** 1 = error in the issue, 2 = service not provided, 9 = other. */
  reasonCode: '1' | '2' | '9'
  /** 15 to 255 characters. */
  reason: string
}

const CANCELLATION_EVENT = '101101'

export const buildCancellation = (input: CancellationInput): string => {
  const id = `PRE${input.accessKey}${CANCELLATION_EVENT}`
  const body = [
    el('tpAmb', input.environment === 'production' ? '1' : '2'),
    el('verAplic', APP_VERSION),
    el('dhEvento', brasiliaDateTime(input.at)),
    el('CNPJAutor', digits(input.issuer.cnpj)),
    el('chNFSe', input.accessKey),
    el(`e${CANCELLATION_EVENT}`, [
      el('xDesc', 'Cancelamento de NFS-e'),
      el('cMotivo', input.reasonCode),
      el('xMotivo', input.reason.trim().padEnd(15, '.').slice(0, 255)),
    ]),
  ].join('')
  return `<?xml version="1.0" encoding="UTF-8"?><pedRegEvento xmlns="${NFSE_NS}" versao="${LAYOUT_VERSION}"><infPedReg Id="${id}">${body}</infPedReg></pedRegEvento>`
}

/** First match of `<tag>value</tag>` in an XML document. */
export const xmlValue = (xml: string, tag: string): string | undefined => xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1]
