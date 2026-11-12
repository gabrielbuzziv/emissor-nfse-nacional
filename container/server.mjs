// Talks to the NFS-e Nacional servers on behalf of the Worker. They ask for the client certificate
// through TLS renegotiation, which Workers' fetch cannot do, so every call to them goes through here.
// The Worker builds the documents; this process signs them (XMLDSig) and sends them over mTLS.
import { execFileSync } from 'node:child_process'
import http from 'node:http'
import https from 'node:https'
import { gunzipSync, gzipSync } from 'node:zlib'
import { signXml } from './sign.mjs'

const PORT = 8080
const TIMEOUT_MS = 30_000

// Secrets are capped at 5 kB, so the base64 .pfx arrives split into CERT_PFX_B64_1, _2, … in order.
const pfxB64 = Object.keys(process.env)
  .filter((name) => /^CERT_PFX_B64_\d+$/.test(name))
  .sort((a, b) => Number(a.split('_').pop()) - Number(b.split('_').pop()))
  .map((name) => process.env[name])
  .join('')
const pfx = Buffer.from(pfxB64, 'base64')
const passphrase = process.env.CERT_PASSWORD ?? ''

const openssl = (args, input) => execFileSync('openssl', args, { input, stdio: 'pipe' }).toString()
// -legacy also opens the older .pfx files (RC2/3DES) that many certificate authorities still issue.
const readPfx = (args) => openssl(['pkcs12', '-legacy', '-passin', 'env:CERT_PASSWORD', ...args], pfx)

/** The signing key and certificate, or why they could not be read: the server starts anyway, so /health can tell. */
const loadCertificate = () => {
  if (!pfx.length) return { error: 'no certificate: upload it with `pnpm run certificate <file.pfx>`' }
  if (!process.env.CERT_PASSWORD) return { error: 'no CERT_PASSWORD: upload the certificate again with `pnpm run certificate <file.pfx>`' }
  try {
    const certPem = openssl(['x509'], readPfx(['-nokeys', '-clcerts']))
    return {
      keyPem: openssl(['pkey'], readPfx(['-nocerts', '-nodes'])),
      certB64: certPem.replace(/-----[^-]+-----|\s/g, ''),
      notAfter: openssl(['x509', '-noout', '-enddate'], certPem).trim().replace('notAfter=', ''),
    }
  } catch (error) {
    const detail = String(error.stderr || error.message).trim().split('\n')[0]
    return { error: `cannot open the certificate (wrong password?): ${detail}` }
  }
}

const certificate = loadCertificate()

/** 503 tells the Worker the government was not reached, so a nota stays retryable. */
const requireCertificate = () => {
  if (certificate.error) throw Object.assign(new Error(certificate.error), { status: 503 })
  return certificate
}

const gov = (host, method, path, body) =>
  new Promise((resolve, reject) => {
    requireCertificate()
    const payload = body === undefined ? undefined : JSON.stringify(body)
    const request = https.request(
      {
        host,
        path,
        method,
        pfx,
        passphrase,
        timeout: TIMEOUT_MS,
        headers: { accept: 'application/json, application/pdf', ...(payload ? { 'content-type': 'application/json' } : {}) },
      },
      (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => resolve({ status: response.statusCode ?? 0, type: response.headers['content-type'] ?? '', body: Buffer.concat(chunks) }))
      },
    )
    request.on('timeout', () => request.destroy(new Error('timeout')))
    request.on('error', reject)
    if (payload) request.write(payload)
    request.end()
  })

/** Gov JSON with every `*XmlGZipB64` field also returned decoded as `*Xml`. */
const decodeJson = (buffer) => {
  const text = buffer.toString('utf8')
  try {
    const json = JSON.parse(text)
    for (const [key, value] of Object.entries(json)) {
      if (key.endsWith('XmlGZipB64') && typeof value === 'string') json[key.replace('GZipB64', '')] = gunzipSync(Buffer.from(value, 'base64')).toString('utf8')
    }
    return json
  } catch {
    return { raw: text.slice(0, 4000) }
  }
}

const readBody = (request) =>
  new Promise((resolve, reject) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}))
    request.on('error', reject)
  })

const routes = {
  'GET /health': async () => ({ status: 200, json: { ok: true, certNotAfter: requireCertificate().notAfter } }),
  /** { host, xml } → signs the DPS and asks for the NFS-e. */
  'POST /dps': async ({ host, xml }) => {
    const { keyPem, certB64 } = requireCertificate()
    const signed = signXml(xml, keyPem, certB64)
    const response = await gov(host, 'POST', '/SefinNacional/nfse', { dpsXmlGZipB64: gzipSync(signed).toString('base64') })
    return { status: response.status, json: { ...decodeJson(response.body), signedXml: signed } }
  },
  /** { host, chave, xml } → signs and registers an event (cancellation) on an NFS-e. */
  'POST /event': async ({ host, chave, xml }) => {
    const { keyPem, certB64 } = requireCertificate()
    const signed = signXml(xml, keyPem, certB64)
    const response = await gov(host, 'POST', `/SefinNacional/nfse/${chave}/eventos`, {
      pedidoRegistroEventoXmlGZipB64: gzipSync(signed).toString('base64'),
    })
    return { status: response.status, json: decodeJson(response.body) }
  },
  /** { host, path } → read-only call; PDFs come back base64-encoded. */
  'POST /get': async ({ host, path }) => {
    const response = await gov(host, 'GET', path)
    return response.type.includes('pdf')
      ? { status: response.status, json: { pdfB64: response.body.toString('base64') } }
      : { status: response.status, json: decodeJson(response.body) }
  },
}

http
  .createServer(async (request, response) => {
    const route = routes[`${request.method} ${new URL(request.url ?? '/', 'http://x').pathname}`]
    try {
      if (!route) throw Object.assign(new Error('not found'), { status: 404 })
      const { status, json } = await route(await readBody(request))
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ status, ...json }))
    } catch (error) {
      // An error status tells the Worker the gov server was not reached (or did not answer), so the outcome is unknown.
      response.writeHead(error.status ?? 502, { 'content-type': 'application/json' }).end(JSON.stringify({ error: String(error.message ?? error) }))
    }
  })
  .listen(PORT)
