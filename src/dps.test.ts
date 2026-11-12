import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { brasiliaDateTime, buildCancellation, buildDps, dpsId, type DpsInput, type Environment, type Issuer } from './dps'

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
