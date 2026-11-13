import { Container } from '@cloudflare/containers'
import { Hono, type MiddlewareHandler } from 'hono'
import { configFrom, configProblems } from './config'
import { hosts, type Environment } from './dps'
import { createNotas, isNotaError, parseIssueRequest, type Gov, type GovResult, type Nota, type NotaStatus } from './notas'
import { publicLookupUrl } from './danfse'
import { createD1Repo } from './repo'

/** The .pfx in base64, split across CERT_PFX_B64_1.._N because a secret holds at most 5 kB; in order. */
const certificateParts = (env: Env): Array<[string, string]> =>
  Object.entries(env)
    .filter((entry): entry is [string, string] => /^CERT_PFX_B64_\d+$/.test(entry[0]) && typeof entry[1] === 'string')
    .sort(([a], [b]) => Number(a.split('_').pop()) - Number(b.split('_').pop()))

/**
 * Runs `container/server.mjs`, the only piece that talks to the government (mTLS with renegotiation).
 * A class because the Containers runtime requires one; it holds no logic of its own.
 */
export class GovClient extends Container<Env> {
  defaultPort = 8080
  sleepAfter = '10m'

  constructor(ctx: DurableObjectState<{}>, env: Env) {
    super(ctx, env)
    this.envVars = { ...Object.fromEntries(certificateParts(env)), ...(env.CERT_PASSWORD ? { CERT_PASSWORD: env.CERT_PASSWORD } : {}) }
  }
}

const NOTA_STATUSES: readonly NotaStatus[] = ['pending', 'unknown', 'issued', 'rejected', 'canceled']
const MAX_LIST = 100

const toHex = (bytes: ArrayBuffer): string => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

/** The container's Durable Object stub, typed as a plain fetcher (its full RPC type is too deep for tsc). */
interface GovFetcher {
  fetch: (input: string, init?: RequestInit) => Promise<Response>
}

/**
 * A running container keeps the certificate it started with, so each certificate gets its own instance: once a new
 * one is uploaded, calls go to a fresh container and the old one sleeps after `sleepAfter`.
 */
const govStub = async (env: Env): Promise<GovFetcher> => {
  const material = certificateParts(env).map(([, value]) => value).join('') + (env.CERT_PASSWORD ?? '')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material))
  return env.GOV.getByName(`gov-${toHex(digest).slice(0, 16)}`) as unknown as GovFetcher
}

const createGov = (env: Env): Gov => {
  const call = async (path: string, body: Record<string, unknown>): Promise<GovResult> => {
    try {
      const response = await (await govStub(env)).fetch(`http://gov${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await response.json()) as Record<string, unknown>
      if (!response.ok) return { reached: false, error: String(json.error ?? response.status) }
      const { status, ...rest } = json
      return { reached: true, status: Number(status), json: rest }
    } catch (error) {
      return { reached: false, error: String(error) }
    }
  }
  return {
    sendDps: (host, xml) => call('/dps', { host, xml }),
    sendEvent: (host, chave, xml) => call('/event', { host, chave, xml }),
    get: (host, path) => call('/get', { host, path }),
  }
}

const notasFor = (env: Env) => createNotas({ repo: createD1Repo(env.DB), gov: createGov(env), config: configFrom(env) })

/** Signature of the public links of a nota: whoever has the link (the buyer's email) can download it, nobody can guess one. */
const linkSignature = async (env: Env, id: string): Promise<string> => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(`links:${env.API_TOKEN}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(id))).slice(0, 32)
}

/** Public links of an issued nota: the PDF, the XML and the government's lookup. */
const linksOf = async (env: Env, origin: string, nota: Nota): Promise<Record<string, string> | undefined> => {
  if (!nota.accessKey) return undefined
  const base = `${origin}/notas/${encodeURIComponent(nota.id)}`
  const sig = await linkSignature(env, nota.id)
  return { pdf: `${base}/nfse.pdf?sig=${sig}`, xml: `${base}/nfse.xml?sig=${sig}`, lookup: publicLookupUrl(nota.accessKey) }
}

/** The nota as the API shows it, with its public links; the NFS-e XML only on request. */
const view = async (env: Env, origin: string, nota: Nota, withXml = false): Promise<Record<string, unknown>> => {
  const { nfseXml, ...rest } = nota
  const links = await linksOf(env, origin, nota)
  return { ...rest, ...(links ? { links } : {}), ...(withXml ? { nfseXml } : {}) }
}

const STATUS_CODE: Record<NotaStatus, 200 | 202 | 422> = { issued: 200, canceled: 200, rejected: 422, pending: 202, unknown: 202 }

const timingSafeEqual = (a: string, b: string): boolean => {
  const encoder = new TextEncoder()
  const left = encoder.encode(a)
  const right = encoder.encode(b)
  return left.byteLength === right.byteLength && crypto.subtle.timingSafeEqual(left, right)
}

const app = new Hono<{ Bindings: Env }>()

const requireToken: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const token = c.req.header('authorization')?.replace(/^Bearer /, '') ?? ''
  if (!c.env.API_TOKEN || !timingSafeEqual(token, c.env.API_TOKEN)) return c.json({ error: 'unauthorized' }, 401)
  await next()
}

app.use('/v1/*', requireToken)
// /health too: it starts the container and, with ?deep=1, calls the government with the certificate.
app.use('/health', requireToken)

/** Checks the vars, starts the container if needed and reports the certificate's expiry; `?deep=1` also asks the government. */
app.get('/health', async (c) => {
  const environment = c.env.NFSE_ENVIRONMENT
  const config = configProblems(c.env)
  try {
    const response = await (await govStub(c.env)).fetch('http://gov/health')
    const container = (await response.json()) as Record<string, string | boolean>
    const isHealthy = response.ok && !config.length
    if (!isHealthy || c.req.query('deep') !== '1') {
      return c.json({ ok: isHealthy, environment, ...(config.length ? { config } : {}), container }, isHealthy ? 200 : 503)
    }
    // A read-only call to the government over mTLS: proves the certificate is accepted and the city is on the system.
    const { adn } = hosts[environment as Environment]
    const agreement = await createGov(c.env).get(adn, `/parametrizacao/${c.env.ISSUER_CITY_CODE}/convenio`)
    const isActive = agreement.reached && agreement.status === 200
    return c.json({ ok: isActive, environment, container, cityAgreement: agreement }, isActive ? 200 : 503)
  } catch (error) {
    return c.json({ ok: false, environment, ...(config.length ? { config } : {}), container: String(error) }, 503)
  }
})

app.onError((error, c) => {
  if (isNotaError(error)) return c.json({ error: error.message }, error.status as 404)
  console.error('nfse: unexpected error', error)
  return c.json({ error: 'internal error' }, 500)
})

/** Issues the nota, or returns the one already issued for `id`. */
app.post('/v1/notas', async (c) => {
  const request = parseIssueRequest(await c.req.json().catch(() => null))
  if (typeof request === 'string') return c.json({ error: request }, 400)
  const nota = await notasFor(c.env).issue(request)
  console.log('nfse: issue', { id: nota.id, status: nota.status, dps: nota.dpsNumber, errors: nota.errors })
  return c.json(await view(c.env, new URL(c.req.url).origin, nota), STATUS_CODE[nota.status])
})

app.get('/v1/notas', async (c) => {
  const status = c.req.query('status') as NotaStatus | undefined
  if (status && !NOTA_STATUSES.includes(status)) return c.json({ error: `status: one of ${NOTA_STATUSES.join(', ')}` }, 400)
  const limit = Math.min(Number(c.req.query('limit') ?? 50) || 50, MAX_LIST)
  const notas = await notasFor(c.env).list({ status, limit, before: c.req.query('before') })
  const origin = new URL(c.req.url).origin
  return c.json({ notas: await Promise.all(notas.map((nota) => view(c.env, origin, nota))) })
})

app.get('/v1/notas/:id', async (c) => {
  const nota = await notasFor(c.env).get(c.req.param('id'))
  return nota ? c.json(await view(c.env, new URL(c.req.url).origin, nota, c.req.query('xml') === '1')) : c.json({ error: 'nota not found' }, 404)
})

app.get('/v1/notas/:id/pdf', async (c) => {
  const pdf = await notasFor(c.env).pdf(c.req.param('id'))
  if (!pdf) return c.json({ error: 'nota not issued' }, 404)
  return new Response(pdf, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="nfse-${c.req.param('id')}.pdf"` } })
})

/** Cancels the nota (event 101101). Body: { reasonCode?: "1" | "2" | "9", reason?: string }. */
app.post('/v1/notas/:id/cancel', async (c) => {
  const body = ((await c.req.json().catch(() => ({}))) ?? {}) as { reasonCode?: '1' | '2' | '9'; reason?: string }
  if (body.reasonCode && !['1', '2', '9'].includes(body.reasonCode)) return c.json({ error: 'reasonCode: 1, 2 or 9' }, 400)
  const nota = await notasFor(c.env).cancel(c.req.param('id'), { code: body.reasonCode, text: body.reason })
  console.log('nfse: cancel', { id: nota.id, status: nota.status, errors: nota.cancelErrors })
  return c.json(await view(c.env, new URL(c.req.url).origin, nota), nota.status === 'canceled' ? 200 : 422)
})

/** Public, signed links (sent in the buyer's email): the PDF and the authorized XML. */
app.get('/notas/:id/:file{nfse\\.(pdf|xml)}', async (c) => {
  const id = c.req.param('id')
  const expected = await linkSignature(c.env, id)
  if (!timingSafeEqual(c.req.query('sig') ?? '', expected)) return c.text('Link inválido.', 403)
  const notas = notasFor(c.env)
  const nota = await notas.get(id)
  if (!nota?.nfseXml) return c.text('Nota não encontrada.', 404)
  const number = nota.nfseNumber ?? nota.dpsNumber
  if (c.req.param('file') === 'nfse.xml') {
    return new Response(nota.nfseXml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'content-disposition': `attachment; filename="nfse-${number}.xml"` } })
  }
  const pdf = await notas.pdf(id)
  if (!pdf) return c.text('Nota não encontrada.', 404)
  return new Response(pdf, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="nfse-${number}.pdf"` } })
})

export default app
