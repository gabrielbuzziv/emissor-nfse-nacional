// Uploads the A1 certificate as secrets of the Worker: the .pfx in base64, split into CERT_PFX_B64_1.._N because a
// secret holds at most 5 kB, plus CERT_PASSWORD; parts left over from a bigger certificate are deleted.
// Usage: pnpm run certificate <file.pfx>. Asks for the password, or reads it from CERT_PASSWORD.
// package.json runs it with --openssl-legacy-provider, so older .pfx files (RC2/3DES) open here as in the container.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createSecureContext, TLSSocket } from 'node:tls'

const PART_SIZE = 4000
const PART_NAME = /^CERT_PFX_B64_(\d+)$/
const ROOT = join(import.meta.dirname, '..')
const WRANGLER = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js')

const fail = (message) => {
  console.error(`\nErro: ${message}`)
  process.exit(1)
}

/** Reads a line from the terminal without showing it. */
const askHidden = (question) =>
  new Promise((resolve, reject) => {
    const { stdin, stdout } = process
    if (!stdin.isTTY) return reject(new Error('sem terminal para pedir a senha; defina CERT_PASSWORD'))
    const chars = []
    const finish = (settle) => {
      stdin.off('data', onData)
      stdin.setRawMode(false)
      stdin.pause()
      stdout.write('\n')
      settle()
    }
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return finish(() => resolve(chars.join('')))
        if (char === '\u0003') return finish(() => reject(new Error('cancelado')))
        if (char === '\u007f' || char === '\b') chars.pop()
        else chars.push(char)
      }
    }
    // Echo goes off before the question shows, so nothing typed right away appears on screen.
    stdin.setRawMode(true)
    stdin.setEncoding('utf8')
    stdin.on('data', onData)
    stdin.resume()
    stdout.write(question)
  })

/** The certificate in the .pfx, opened the way the container's TLS client opens it. */
const openCertificate = (pfx, passphrase) => {
  try {
    const socket = new TLSSocket(null, { isServer: true, secureContext: createSecureContext({ pfx, passphrase }) })
    const certificate = socket.getCertificate()
    socket.destroy()
    return certificate?.subject ? certificate : fail('o arquivo não tem um certificado.')
  } catch (error) {
    return fail(/mac verify failure/i.test(error.message) ? 'senha incorreta.' : `não foi possível abrir o certificado (${error.message}).`)
  }
}

const wrangler = (args, input) => {
  try {
    return execFileSync(process.execPath, [WRANGLER, ...args], { cwd: ROOT, input, stdio: [input === undefined ? 'inherit' : 'pipe', 'pipe', 'inherit'] }).toString()
  } catch {
    return fail(`o comando \`wrangler ${args.join(' ')}\` falhou (veja a mensagem acima). Você já rodou \`pnpm wrangler login\` e \`pnpm run deploy\`?`)
  }
}

const [file] = process.argv.slice(2)
if (!file) fail('informe o arquivo: pnpm run certificate <arquivo.pfx>')

const pfx = (() => {
  try {
    return readFileSync(file)
  } catch {
    return fail(`arquivo não encontrado: ${file}`)
  }
})()
const password = process.env.CERT_PASSWORD ?? (await askHidden('Senha do certificado: ').catch((error) => fail(error.message)))
const certificate = openCertificate(pfx, password)
const expiresAt = new Date(certificate.valid_to)

console.log(`Certificado: ${certificate.subject.CN}`)
console.log(`Válido até: ${expiresAt.toLocaleDateString('pt-BR')}`)
if (expiresAt < new Date()) fail('este certificado está vencido.')

const certificateCnpj = String(certificate.subject.CN ?? '').match(/\d{14}/)?.[0]
const issuerCnpj = readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8').match(/"ISSUER_CNPJ":\s*"([^"]*)"/)?.[1]?.replace(/\D/g, '')
if (certificateCnpj && issuerCnpj && certificateCnpj !== issuerCnpj) {
  console.warn(`Atenção: o certificado é do CNPJ ${certificateCnpj}, mas o ISSUER_CNPJ do wrangler.jsonc é ${issuerCnpj}.`)
}

const base64 = pfx.toString('base64')
const parts = Array.from({ length: Math.ceil(base64.length / PART_SIZE) }, (_, index) => base64.slice(index * PART_SIZE, (index + 1) * PART_SIZE))
const listed = wrangler(['secret', 'list', '--format', 'json'])
const stale = JSON.parse(listed.slice(listed.indexOf('[')))
  .map((secret) => secret.name)
  .filter((name) => Number(name.match(PART_NAME)?.[1] ?? 0) > parts.length)
const secrets = {
  ...Object.fromEntries(parts.map((part, index) => [`CERT_PFX_B64_${index + 1}`, part])),
  CERT_PASSWORD: password,
  ...Object.fromEntries(stale.map((name) => [name, null])),
}

console.log(`\nEnviando o certificado (${parts.length} ${parts.length === 1 ? 'parte' : 'partes'})...`)
console.log(wrangler(['secret', 'bulk'], JSON.stringify(secrets)))
console.log('Pronto. As próximas chamadas já usam este certificado; confira a validade em GET /health (certNotAfter).')
