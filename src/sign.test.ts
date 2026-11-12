import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
// @ts-expect-error plain JS module that runs in the container
import { signXml } from '../container/sign.mjs'
import { buildCancellation, buildDps, type Issuer } from './dps'

const issuer: Issuer = { cnpj: '11222333000181', cityCode: '3550308', simplesNacionalOption: '3', simplesNacionalTotalTaxPercent: '6.00' }
const dir = mkdtempSync(join(tmpdir(), 'nfse-sign-'))
const keyPath = join(dir, 'key.pem')
const certPath = join(dir, 'cert.pem')
// xmlsec1 1.3 looks keys up strictly; --lax-key-search brings back the 1.2 behavior and does not exist in 1.2.
const LAX_KEY_SEARCH = /\b1\.2\./.test(execFileSync('xmlsec1', ['--version']).toString()) ? [] : ['--lax-key-search']

beforeAll(() => {
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-days', '1', '-subj', '/CN=test'], { stdio: 'pipe' })
})

/** Checks the signature with xmlsec1, an implementation independent from ours; '' when valid. */
const verify = (xml: string, idAttr: string): string => {
  const file = join(dir, `${Math.random()}.xml`)
  writeFileSync(file, xml)
  try {
    execFileSync('xmlsec1', ['--verify', '--pubkey-cert-pem', certPath, '--id-attr:Id', idAttr, ...LAX_KEY_SEARCH, file], { stdio: 'pipe' })
    return ''
  } catch (error) {
    return String((error as { stderr?: Buffer }).stderr)
  }
}

const sign = (xml: string): string => {
  const certB64 = readFileSync(certPath, 'utf8').replace(/-----[^-]+-----|\s/g, '')
  return signXml(xml, readFileSync(keyPath, 'utf8'), certB64) as string
}

describe('signXml', () => {
  it('produces a DPS signature that xmlsec1 accepts', () => {
    const { xml } = buildDps({
      environment: 'production',
      issuer,
      series: '1',
      number: 7,
      issuedAt: new Date(),
      competence: '2026-11-10',
      taker: { taxId: '12345678909', name: 'Maria & João' },
      serviceCode: '080201',
      description: 'Curso online “Fotografia & Luz”',
      valueCents: 9700,
    })
    expect(verify(sign(xml), 'infDPS')).toBe('')
  })

  it('produces a cancellation signature that xmlsec1 accepts', () => {
    const xml = buildCancellation({
      environment: 'production',
      issuer,
      accessKey: '4'.repeat(50),
      at: new Date(),
      reasonCode: '2',
      reason: 'Venda reembolsada ao cliente',
    })
    expect(verify(sign(xml), 'infPedReg')).toBe('')
  })

  it('fails verification when the signed content changes', () => {
    const { xml } = buildDps({
      environment: 'production',
      issuer,
      series: '1',
      number: 8,
      issuedAt: new Date(),
      competence: '2026-11-10',
      serviceCode: '080201',
      description: 'Curso',
      valueCents: 9700,
    })
    expect(verify(sign(xml).replace('<vServ>97.00</vServ>', '<vServ>1.00</vServ>'), 'infDPS')).not.toBe('')
  })
})
