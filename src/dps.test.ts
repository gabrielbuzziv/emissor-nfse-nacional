import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { brasiliaDateTime, buildCancellation, buildDps, dpsId, type DpsInput, type Environment, type Issuer, type Taker } from './dps'

const issuer: Issuer = {
  cnpj: '11.222.333/0001-81',
  cityCode: '3550308',
  municipalSubscription: '12345',
  simplesNacionalOption: '3',
  simplesNacionalApuration: '1',
  simplesNacionalTotalTaxPercent: '6.00',
}

const input = (overrides: Partial<DpsInput> = {}): DpsInput => ({
  environment: 'production',
  issuer,
  series: '1',
  number: 42,
  issuedAt: new Date('2026-11-12T15:00:00Z'),
  competence: '2026-11-10',
  taker: { taxId: '123.456.789-09', name: 'Maria & João <Silva>', email: 'maria@example.com' },
  serviceCode: '080201',
  nbsCode: '122051900',
  description: 'Curso online “Fotografia & Luz”',
  valueCents: 9700,
  ...overrides,
})

const dir = mkdtempSync(join(tmpdir(), 'nfse-xsd-'))

/** Validates `xml` against the official schema of the environment; returns xmllint's complaint, if any. */
const schemaErrors = (xml: string, environment: Environment, schema: string): string => {
  const file = join(dir, `${Math.random()}.xml`)
  writeFileSync(file, xml)
  try {
    execFileSync('xmllint', ['--noout', '--schema', join(import.meta.dirname, '..', 'schemas', environment, schema), file], { stdio: 'pipe' })
    return ''
  } catch (error) {
    return String((error as { stderr?: Buffer }).stderr)
  }
}

describe('buildDps', () => {
  it.each<Environment>(['production', 'restricted'])('passes the official %s schema', (environment) => {
    expect(schemaErrors(buildDps(input({ environment })).xml, environment, 'DPS_v1.01.xsd')).toBe('')
  })

  it('places the NBS code where each environment expects it', () => {
    expect(buildDps(input()).xml).toMatch(/<cServ><cTribNac>080201<\/cTribNac><xDescServ>[^<]*<\/xDescServ><cNBS>122051900<\/cNBS><\/cServ>/)
    expect(buildDps(input({ environment: 'restricted' })).xml).toContain('<cServ><cTribNac>080201</cTribNac><cNBS>122051900</cNBS><xDescServ>')
    expect(buildDps(input({ nbsCode: undefined })).xml).toMatch(/<cServ><cTribNac>080201<\/cTribNac><xDescServ>[^<]*<\/xDescServ><\/cServ>/)
  })

  it('passes without a taker', () => {
    expect(schemaErrors(buildDps(input({ taker: undefined })).xml, 'production', 'DPS_v1.01.xsd')).toBe('')
  })

  it('uses the CNPJ element for a company taker', () => {
    const { xml } = buildDps(input({ taker: { taxId: '11.444.777/0001-61', name: 'Empresa' } }))
    expect(xml).toContain('<toma><CNPJ>11444777000161</CNPJ><xNome>Empresa</xNome></toma>')
    expect(schemaErrors(xml, 'production', 'DPS_v1.01.xsd')).toBe('')
  })

  it('writes canonical XML: escaped text, no whitespace between tags, no self-closing tags', () => {
    const { xml } = buildDps(input())
    expect(xml).toContain('<xNome>Maria &amp; João &lt;Silva&gt;</xNome>')
    expect(xml).not.toMatch(/>\s+</)
    expect(xml).not.toMatch(/\/>/)
  })

  it('identifies the DPS by city, CNPJ, series and number', () => {
    expect(dpsId(issuer, '1', 42)).toBe('DPS3550308211222333000181' + '00001' + '000000000000042')
    expect(buildDps(input()).id).toHaveLength(45)
  })

  it('states the Simples rate for ME/EPP and the plain indicator otherwise', () => {
    expect(buildDps(input()).xml).toContain('<totTrib><pTotTribSN>6.00</pTotTribSN></totTrib>')
    const notOptedIn = buildDps(input({ issuer: { ...issuer, simplesNacionalOption: '1' } })).xml
    expect(notOptedIn).toContain('<totTrib><indTotTrib>0</indTotTrib></totTrib>')
    expect(notOptedIn).not.toContain('regApTribSN')
  })

  // Rules E0162, E0174, E0583, E0600 and E0710: a MEI states no Simples apuration, special regime, retention, rate or Simples rate.
  it.each<Environment>(['production', 'restricted'])('builds what the rules ask of a MEI in the %s schema', (environment) => {
    const mei: Issuer = { cnpj: issuer.cnpj, cityCode: issuer.cityCode, simplesNacionalOption: '2' }
    const { xml } = buildDps(input({ environment, issuer: mei }))
    expect(schemaErrors(xml, environment, 'DPS_v1.01.xsd')).toBe('')
    expect(xml).toContain('<regTrib><opSimpNac>2</opSimpNac><regEspTrib>0</regEspTrib></regTrib>')
    expect(xml).toContain('<tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun><totTrib><indTotTrib>0</indTotTrib></totTrib>')
  })

  describe('export of services', () => {
    const address = { country: 'us', postalCode: '94105', city: 'San Francisco', region: 'CA', street: 'Market St', number: '1' }
    const abroad: Taker = {
      name: 'Acme Inc.',
      email: 'billing@acme.example',
      abroad: {
        nif: '12-3456789',
        address,
      },
    }
    const exported = (overrides: Partial<DpsInput> = {}) =>
      input({ taker: abroad, serviceCode: '010101', nbsCode: '115022000', export: { resultCountry: 'us', currency: '220', foreignValueCents: 1800 }, ...overrides })

    it.each<Environment>(['production', 'restricted'])('passes the official %s schema', (environment) => {
      expect(schemaErrors(buildDps(exported({ environment })).xml, environment, 'DPS_v1.01.xsd')).toBe('')
    })

    it.each<Environment>(['production', 'restricted'])('passes the %s schema for a MEI and a taker without NIF', (environment) => {
      const mei: Issuer = { cnpj: issuer.cnpj, cityCode: issuer.cityCode, simplesNacionalOption: '2' }
      const taker: Taker = { name: 'Acme', abroad: { noNifReason: '1', address: { ...address, complement: 'Suite 5', district: 'SoMa' } } }
      const { xml } = buildDps(exported({ environment, issuer: mei, taker }))
      expect(schemaErrors(xml, environment, 'DPS_v1.01.xsd')).toBe('')
      expect(xml).toContain('<toma><cNaoNIF>1</cNaoNIF><xNome>Acme</xNome><end><endExt><cPais>US</cPais>')
      expect(xml).toContain('<xCpl>Suite 5</xCpl><xBairro>SoMa</xBairro></end>')
    })

    // Rules E0242, E0233: a NIF needs the name and the address abroad; the neighbourhood falls back to the city.
    it('identifies the taker abroad by NIF and foreign address', () => {
      expect(buildDps(exported()).xml).toContain(
        '<toma><NIF>12-3456789</NIF><xNome>Acme Inc.</xNome><end><endExt><cPais>US</cPais><cEndPost>94105</cEndPost><xCidade>San Francisco</xCidade><xEstProvReg>CA</xEstProvReg></endExt><xLgr>Market St</xLgr><nro>1</nro><xBairro>San Francisco</xBairro></end><email>billing@acme.example</email></toma>',
      )
    })

    // Rules E0330, E0333, E0341, E0343, E0345, E0354: comExt with no "unknown" values and no DI/RE.
    it('adds the foreign trade group after the service code', () => {
      expect(buildDps(exported()).xml).toContain(
        '</cServ><comExt><mdPrestacao>1</mdPrestacao><vincPrest>0</vincPrest><tpMoeda>220</tpMoeda><vServMoeda>18.00</vServMoeda><mecAFComexP>01</mecAFComexP><mecAFComexT>01</mecAFComexT><movTempBens>1</movTempBens><mdic>0</mdic></comExt></serv>',
      )
      const custom = buildDps(exported({ export: { resultCountry: 'DE', currency: '978', foreignValueCents: 5, mode: '2', relationship: '1', issuerSupport: '02', takerSupport: '24', shareWithMdic: true } })).xml
      expect(custom).toContain('<comExt><mdPrestacao>2</mdPrestacao><vincPrest>1</vincPrest><tpMoeda>978</tpMoeda><vServMoeda>0.05</vServMoeda><mecAFComexP>02</mecAFComexP><mecAFComexT>24</mecAFComexT><movTempBens>1</movTempBens><mdic>1</mdic></comExt>')
    })

    // Rules E0580, E0590, E0602: export of services, the result country, no retention and no rate.
    it('states the export with the result country', () => {
      expect(buildDps(exported()).xml).toContain('<tribMun><tribISSQN>3</tribISSQN><cPaisResult>US</cPaisResult><tpRetISSQN>1</tpRetISSQN></tribMun><totTrib><pTotTribSN>6.00</pTotTribSN></totTrib>')
    })

    it.each<Environment>(['production', 'restricted'])('passes the %s schema for a taker abroad with no NIF nor address', (environment) => {
      const { xml } = buildDps(exported({ environment, taker: { name: 'Bucksense', phone: '(63) 98418-5192', email: 'a@b.example', abroad: { noNifReason: '2' } } }))
      expect(schemaErrors(xml, environment, 'DPS_v1.01.xsd')).toBe('')
      expect(xml).toContain('<toma><cNaoNIF>2</cNaoNIF><xNome>Bucksense</xNome><fone>63984185192</fone><email>a@b.example</email></toma>')
    })

    it('keeps the service in the issuer city', () => {
      expect(buildDps(exported()).xml).toContain('<locPrest><cLocPrestacao>3550308</cLocPrestacao></locPrest>')
    })
  })

  it.each<Environment>(['production', 'restricted'])('passes the %s schema when replacing a nota', (environment) => {
    const replaces = { accessKey: '35503082211222333000181000000000000126111234567890', reasonCode: '99' as const, reason: 'Moeda errada' }
    const { xml } = buildDps(input({ environment, replaces }))
    expect(schemaErrors(xml, environment, 'DPS_v1.01.xsd')).toBe('')
    expect(xml).toContain(`<cLocEmi>3550308</cLocEmi><subst><chSubstda>${replaces.accessKey}</chSubstda><cMotivo>99</cMotivo><xMotivo>Moeda errada...</xMotivo></subst><prest>`)
  })

  it('formats money and Brasília time', () => {
    expect(buildDps(input({ valueCents: 1990 })).xml).toContain('<vServ>19.90</vServ>')
    expect(brasiliaDateTime(new Date('2026-11-12T02:30:00Z'))).toBe('2026-11-11T23:30:00-03:00')
  })
})

describe('buildCancellation', () => {
  const accessKey = '35503082211222333000181000000000000126111234567890'

  it.each<Environment>(['production', 'restricted'])('passes the official %s schema', (environment) => {
    const xml = buildCancellation({ environment, issuer, accessKey, at: new Date(), reasonCode: '2', reason: 'Venda reembolsada' })
    expect(schemaErrors(xml, environment, 'pedRegEvento_v1.01.xsd')).toBe('')
  })

  it('pads a short reason to the 15-character minimum', () => {
    const xml = buildCancellation({ environment: 'production', issuer, accessKey, at: new Date(), reasonCode: '9', reason: 'Reembolso' })
    expect(xml).toContain('<xMotivo>Reembolso......</xMotivo>')
  })
})
