import { describe, expect, it } from 'vitest'
import { xmlValue } from './dps'
import { createNotas, type Config, type Gov, type GovResult, type IssueRequest } from './notas'
import { createMemoryRepo } from './repo'

const config: Config = {
  environment: 'production',
  series: '1',
  issuer: { cnpj: '11222333000181', cityCode: '3550308', simplesNacionalOption: '3', simplesNacionalApuration: '1', simplesNacionalTotalTaxPercent: '6.00' },
}

const request = (overrides: Partial<IssueRequest> = {}): IssueRequest => ({
  id: 'pedido:1001',
  competence: '2026-11-10',
  taker: { taxId: '12345678909', name: 'Maria Silva' },
  serviceCode: '080201',
  description: 'Curso online',
  valueCents: 9700,
  ...overrides,
})

const nfseXmlFor = (dpsXml: string, number: string): string =>
  `<NFSe><infNFSe><nNFSe>${number}</nNFSe><dhProc>2026-11-12T10:00:00-03:00</dhProc>${dpsXml.replace(/<\?xml[^>]*>/, '')}</infNFSe></NFSe>`

const ok = (status: number, json: Record<string, unknown>): GovResult => ({ reached: true, status, json })
const lost: GovResult = { reached: false, error: 'timeout' }

/**
 * Government double: issues NFS-e keyed by DPS id, like the real Sefin. `script` overrides the answer of
 * the next sends (lost answers, rejections) before the default behavior applies.
 */
const createFakeGov = () => {
  const byDpsId = new Map<string, { accessKey: string; nfseXml: string }>()
  const canceled = new Set<string>()
  const sendScript: Array<'lose-after-issuing' | 'unreachable' | GovResult> = []
  const sent: string[] = []
  let nextKey = 1

  const issueFor = (xml: string) => {
    const dpsId = xml.match(/Id="(DPS\d+)"/)?.[1] ?? ''
    const accessKey = String(nextKey++).padStart(50, '4')
    const issued = { accessKey, nfseXml: nfseXmlFor(xml, String(nextKey)) }
    byDpsId.set(dpsId, issued)
    return { dpsId, issued }
  }

  const gov: Gov = {
    sendDps: async (_host, xml) => {
      sent.push(xml)
      const step = sendScript.shift()
      if (step === 'unreachable') return lost
      if (step === 'lose-after-issuing') {
        issueFor(xml)
        return lost
      }
      if (step) return step
      const dpsId = xml.match(/Id="(DPS\d+)"/)?.[1] ?? ''
      if (byDpsId.has(dpsId)) return ok(400, { erros: [{ Codigo: 'E0014', Descricao: 'DPS já existe' }] })
      const { issued } = issueFor(xml)
      return ok(201, { chaveAcesso: issued.accessKey, nfseXml: issued.nfseXml })
    },
    sendEvent: async (_host, accessKey) => {
      if (canceled.has(accessKey)) return ok(400, { erros: [{ Codigo: 'E0840', Descricao: 'NFS-e já está cancelada.' }] })
      canceled.add(accessKey)
      return ok(201, { eventoXml: '<evento/>' })
    },
    get: async (_host, path) => {
      const dps = path.match(/\/dps\/(DPS\d+)$/)?.[1]
      if (dps) {
        const found = byDpsId.get(dps)
        return found ? ok(200, { chaveAcesso: found.accessKey }) : ok(404, {})
      }
      const key = path.match(/\/nfse\/(\d{50})$/)?.[1]
      if (key) {
        const found = [...byDpsId.values()].find((issued) => issued.accessKey === key)
        return found ? ok(200, { nfseXml: found.nfseXml }) : ok(404, {})
      }
      if (path.startsWith('/danfse/')) return ok(200, { pdfB64: btoa('%PDF-1.4') })
      return ok(404, {})
    },
  }
  return { gov, byDpsId, sendScript, sent, canceled }
}

const setup = () => {
  const repo = createMemoryRepo()
  const fake = createFakeGov()
  const notas = createNotas({ repo, gov: fake.gov, config, now: () => new Date('2026-11-12T15:00:00Z') })
  return { repo, fake, notas }
}

describe('issue', () => {
  it('issues the nota and keeps the access key and number', async () => {
    const { notas, fake } = setup()
    const nota = await notas.issue(request())
    expect(nota).toMatchObject({ status: 'issued', dpsNumber: 1, accessKey: expect.stringMatching(/^\d{50}$/), nfseNumber: '2' })
    expect(xmlValue(fake.sent[0] ?? '', 'dCompet')).toBe('2026-11-10')
    expect(xmlValue(fake.sent[0] ?? '', 'dhEmi')).toBe('2026-11-12T11:59:00-03:00')
  })

  it('never issues twice for the same id', async () => {
    const { notas, fake } = setup()
    const first = await notas.issue(request())
    const second = await notas.issue(request({ valueCents: 1 }))
    expect(second.accessKey).toBe(first.accessKey)
    expect(fake.sent).toHaveLength(1)
  })

  it('defaults the competence to the issue date in Brasília', async () => {
    const { notas, fake } = setup()
    await notas.issue(request({ competence: undefined }))
    expect(xmlValue(fake.sent[0] ?? '', 'dCompet')).toBe('2026-11-12')
  })

  it('keeps the rejection, and a corrected retry reuses the DPS number', async () => {
    const { notas, fake } = setup()
    fake.sendScript.push(ok(400, { erros: [{ Codigo: 'E0160', Descricao: 'Opção do Simples', Complemento: 'x' }] }))
    const rejected = await notas.issue(request())
    expect(rejected).toMatchObject({ status: 'rejected', errors: [{ code: 'E0160', message: 'Opção do Simples', detail: 'x' }] })
    const retried = await notas.issue(request({ description: 'Curso corrigido' }))
    expect(retried).toMatchObject({ status: 'issued', dpsNumber: rejected.dpsNumber, errors: undefined })
    expect(xmlValue(fake.sent[1] ?? '', 'xDescServ')).toBe('Curso corrigido')
  })

  it('keeps the HTTP status and the answer when a refusal has no error list', async () => {
    const { notas, fake } = setup()
    fake.sendScript.push(ok(403, { raw: '<html>403 Forbidden</html>', signedXml: '<DPS/>' }))
    const nota = await notas.issue(request())
    expect(nota).toMatchObject({ status: 'rejected', errors: [{ code: 'HTTP 403', message: '<html>403 Forbidden</html>' }] })
  })

  it('marks a lost answer unknown and, on retry, finds the NFS-e the government did issue', async () => {
    const { notas, fake } = setup()
    fake.sendScript.push('lose-after-issuing')
    expect((await notas.issue(request())).status).toBe('unknown')
    const resolved = await notas.issue(request())
    expect(resolved).toMatchObject({ status: 'issued', accessKey: [...fake.byDpsId.values()][0]?.accessKey })
    expect(fake.sent).toHaveLength(1)
  })

  it('resends with the same number when the lost DPS never reached the government', async () => {
    const { notas, fake } = setup()
    fake.sendScript.push('unreachable')
    const unknown = await notas.issue(request())
    expect(unknown.status).toBe('unknown')
    const issued = await notas.issue(request())
    expect(issued).toMatchObject({ status: 'issued', dpsNumber: unknown.dpsNumber })
  })

  it('recognizes its own NFS-e behind a duplicate-DPS rejection', async () => {
    const { notas, fake, repo } = setup()
    fake.sendScript.push('lose-after-issuing')
    const unknown = await notas.issue(request())
    // Simulate a crash that left the nota pending (the lookup path is skipped, the send gets E0014).
    await repo.save({ ...unknown, status: 'pending' })
    const issued = await notas.issue(request())
    expect(issued.status).toBe('issued')
    expect(fake.sent).toHaveLength(2)
  })

  it('moves to the next DPS number when the number belongs to an NFS-e issued elsewhere', async () => {
    const { notas, fake } = setup()
    // DPS number 1 was used by the government portal for another sale.
    await createNotas({ repo: createMemoryRepo(), gov: fake.gov, config }).issue(request({ id: 'portal', valueCents: 5000, taker: undefined }))
    const nota = await notas.issue(request())
    expect(nota).toMatchObject({ status: 'issued', dpsNumber: 2 })
  })
})

describe('cancel', () => {
  it('cancels an issued nota', async () => {
    const { notas, fake } = setup()
    const nota = await notas.issue(request())
    const canceled = await notas.cancel(nota.id, {})
    expect(canceled).toMatchObject({ status: 'canceled', canceledAt: expect.any(String) })
    expect(fake.canceled.has(nota.accessKey ?? '')).toBe(true)
  })

  it('treats an already-canceled answer as done', async () => {
    const { notas, fake } = setup()
    const nota = await notas.issue(request())
    fake.canceled.add(nota.accessKey ?? '')
    expect((await notas.cancel(nota.id, {})).status).toBe('canceled')
  })

  it('keeps the government refusal of a cancellation, in any shape', async () => {
    const { notas, fake } = setup()
    const nota = await notas.issue(request())
    fake.gov.sendEvent = async () => ok(400, { title: 'One or more validation errors occurred.' })
    const refused = await notas.cancel(nota.id, {})
    expect(refused).toMatchObject({ status: 'issued', cancelErrors: [{ code: 'HTTP 400', message: '{"title":"One or more validation errors occurred."}' }] })
  })

  it('refuses a nota that was never issued', async () => {
    const { notas, fake } = setup()
    fake.sendScript.push(ok(400, { erros: [{ Codigo: 'E0160', Descricao: 'x' }] }))
    await notas.issue(request())
    await expect(notas.cancel('pedido:1001', {})).rejects.toMatchObject({ status: 409 })
    await expect(notas.cancel('missing', {})).rejects.toMatchObject({ status: 404 })
  })
})

describe('pdf', () => {
  it('renders the PDF from the XML when the government DANFSe service is down', async () => {
    const repo = createMemoryRepo()
    const fake = createFakeGov()
    const gov: Gov = { ...fake.gov, get: async (host, path) => (path.startsWith('/danfse/') ? ok(503, { raw: 'No server is available' }) : fake.gov.get(host, path)) }
    const notas = createNotas({ repo, gov, config, now: () => new Date('2026-11-12T15:00:00Z') })
    await notas.issue(request())
    const pdf = await notas.pdf('pedido:1001')
    expect(new TextDecoder().decode((pdf ?? new Uint8Array()).slice(0, 5))).toBe('%PDF-')
  })

  it('returns the DANFSe of an issued nota', async () => {
    const { notas } = setup()
    await notas.issue(request())
    const pdf = await notas.pdf('pedido:1001')
    expect(new TextDecoder().decode(pdf ?? new Uint8Array())).toBe('%PDF-1.4')
  })
})
