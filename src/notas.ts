import { renderDanfse } from './danfse'
import { buildCancellation, buildDps, brasiliaDate, hosts, xmlValue, type Environment, type Issuer, type Taker } from './dps'

/** What a client asks for. `id` is the client's own key for the sale: asking twice never issues twice. */
export interface IssueRequest {
  id: string
  /** Date the service was provided (YYYY-MM-DD, Brasília); defaults to today. */
  competence?: string
  taker?: Taker
  /** National service code (cTribNac), 6 digits. */
  serviceCode: string
  /** NBS code, 9 digits. */
  nbsCode?: string
  description: string
  valueCents: number
}

export interface GovError {
  code: string
  message: string
  detail?: string
}

/**
 * - pending: number reserved, never answered by the government.
 * - unknown: sent, but the answer was lost; resolved on the next try by asking for the DPS.
 * - issued / rejected / canceled: the government's answer.
 */
export type NotaStatus = 'pending' | 'unknown' | 'issued' | 'rejected' | 'canceled'

export interface Nota {
  id: string
  status: NotaStatus
  request: IssueRequest
  dpsNumber: number
  dpsId: string
  accessKey?: string
  nfseNumber?: string
  issuedAt?: string
  errors?: GovError[]
  cancelErrors?: GovError[]
  canceledAt?: string
  nfseXml?: string
  createdAt: string
  updatedAt: string
}

export interface Repo {
  get(id: string): Promise<Nota | null>
  /** Inserts or replaces the nota. */
  save(nota: Nota): Promise<void>
  /** Next DPS number of the series; never repeats. */
  nextNumber(): Promise<number>
  list(options: { status?: NotaStatus; limit: number; before?: string }): Promise<Nota[]>
}

/** Answer from the container; `reached: false` when the government was not reached or did not answer. */
export type GovResult = { reached: true; status: number; json: Record<string, unknown> } | { reached: false; error: string }

export interface Gov {
  sendDps(host: string, xml: string): Promise<GovResult>
  sendEvent(host: string, accessKey: string, xml: string): Promise<GovResult>
  get(host: string, path: string): Promise<GovResult>
}

export interface Config {
  environment: Environment
  issuer: Issuer
  series: string
}

export interface Notas {
  issue(request: IssueRequest): Promise<Nota>
  get(id: string): Promise<Nota | null>
  cancel(id: string, reason: { code?: '1' | '2' | '9'; text?: string }): Promise<Nota>
  pdf(id: string): Promise<Uint8Array | null>
  list(options: { status?: NotaStatus; limit: number; before?: string }): Promise<Nota[]>
}

export const notaError = (status: number, message: string): Error & { status: number } => Object.assign(new Error(message), { status })

export const isNotaError = (error: unknown): error is Error & { status: number } =>
  error instanceof Error && typeof (error as { status?: unknown }).status === 'number'

const DUPLICATE_DPS = 'E0014'
const MAX_NUMBER_COLLISIONS = 5
const ALREADY_CANCELED = /j[aá] (foi |est[aá] )?cancelad|cancelamento.*j[aá]/i
/** dhEmi must not be after the government's clock; stay a bit behind ours. */
const CLOCK_SKEW_MS = 60_000

const govErrors = (status: number, json: Record<string, unknown>): GovError[] => {
  const list = (json.erros ?? json.Erros ?? json.erro ?? []) as Array<Record<string, unknown>> | Record<string, unknown>
  const errors = (Array.isArray(list) ? list : [list]).map((error) => ({
    code: String(error.Codigo ?? error.codigo ?? ''),
    message: String(error.Descricao ?? error.descricao ?? error.Mensagem ?? ''),
    ...(error.Complemento ? { detail: String(error.Complemento) } : {}),
  }))
  if (errors.length) return errors
  // An answer without an error list (an HTML 403 when the certificate is refused, say) still tells what happened.
  const { signedXml: _signedXml, ...answer } = json
  return [{ code: `HTTP ${status}`, message: (typeof answer.raw === 'string' ? answer.raw : JSON.stringify(answer)).slice(0, 500) }]
}

export const createNotas = ({ repo, gov, config, now = () => new Date() }: { repo: Repo; gov: Gov; config: Config; now?: () => Date }): Notas => {
  const { sefin, adn } = hosts[config.environment]

  const save = async (nota: Nota, changes: Partial<Nota>): Promise<Nota> => {
    const next = { ...nota, ...changes, updatedAt: now().toISOString() }
    await repo.save(next)
    return next
  }

  const markIssued = (nota: Nota, accessKey: string, nfseXml: string | undefined): Promise<Nota> =>
    save(nota, {
      status: 'issued',
      accessKey,
      nfseXml,
      nfseNumber: nfseXml ? xmlValue(nfseXml, 'nNFSe') : undefined,
      issuedAt: (nfseXml && xmlValue(nfseXml, 'dhProc')) || now().toISOString(),
      errors: undefined,
    })

  /** The NFS-e already generated for this DPS id, when it is this nota's (same value and taker). */
  const findIssued = async (nota: Nota): Promise<{ accessKey: string; nfseXml?: string } | 'not-found' | 'not-ours' | 'unreachable'> => {
    const lookup = await gov.get(sefin, `/SefinNacional/dps/${nota.dpsId}`)
    if (!lookup.reached) return 'unreachable'
    if (lookup.status === 404) return 'not-found'
    const accessKey = String(lookup.json.chaveAcesso ?? '')
    if (lookup.status !== 200 || !accessKey) return 'unreachable'
    const nfse = await gov.get(sefin, `/SefinNacional/nfse/${accessKey}`)
    const nfseXml = nfse.reached ? (nfse.json.nfseXml as string | undefined) : undefined
    if (!nfseXml) return { accessKey }
    const sameValue = xmlValue(nfseXml, 'vServ') === (nota.request.valueCents / 100).toFixed(2)
    const takerId = nota.request.taker?.taxId.replace(/\D/g, '')
    const sameTaker = !takerId || nfseXml.includes(`>${takerId}<`)
    return sameValue && sameTaker ? { accessKey, nfseXml } : 'not-ours'
  }

  const send = async (nota: Nota, collisions = 0): Promise<Nota> => {
    const issuedAt = new Date(now().getTime() - CLOCK_SKEW_MS)
    const { id: dpsId, xml } = buildDps({
      environment: config.environment,
      issuer: config.issuer,
      series: config.series,
      number: nota.dpsNumber,
      issuedAt,
      competence: nota.request.competence ?? brasiliaDate(issuedAt),
      taker: nota.request.taker,
      serviceCode: nota.request.serviceCode,
      nbsCode: nota.request.nbsCode,
      description: nota.request.description,
      valueCents: nota.request.valueCents,
    })
    const sending = await save(nota, { dpsId, status: 'unknown' })
    const result = await gov.sendDps(sefin, xml)
    if (!result.reached || result.status >= 500) return sending

    const accessKey = String(result.json.chaveAcesso ?? '')
    if (result.status < 300 && accessKey) return markIssued(sending, accessKey, result.json.nfseXml as string | undefined)

    const errors = govErrors(result.status, result.json)
    if (!errors.some((error) => error.code === DUPLICATE_DPS)) return save(sending, { status: 'rejected', errors })

    // This DPS number already has an NFS-e: ours from a lost answer, or one issued elsewhere (another system or the gov portal).
    const found = await findIssued(sending)
    if (found === 'unreachable') return sending
    if (typeof found === 'object') return markIssued(sending, found.accessKey, found.nfseXml)
    if (collisions >= MAX_NUMBER_COLLISIONS) return save(sending, { status: 'rejected', errors })
    return send(await save(sending, { dpsNumber: await repo.nextNumber() }), collisions + 1)
  }

  const issue = async (request: IssueRequest): Promise<Nota> => {
    const existing = await repo.get(request.id)
    if (existing?.status === 'issued' || existing?.status === 'canceled') return existing
    if (existing?.status === 'unknown') {
      const found = await findIssued(existing)
      if (typeof found === 'object') return markIssued(existing, found.accessKey, found.nfseXml)
      if (found === 'unreachable') return existing
    }
    const at = now().toISOString()
    const nota: Nota = existing
      ? { ...existing, request: existing.status === 'rejected' || existing.status === 'pending' ? request : existing.request }
      : { id: request.id, status: 'pending', request, dpsNumber: await repo.nextNumber(), dpsId: '', createdAt: at, updatedAt: at }
    if (!existing) await repo.save(nota)
    return send(nota)
  }

  const cancel: Notas['cancel'] = async (id, reason) => {
    const nota = await repo.get(id)
    if (!nota) throw notaError(404, 'nota not found')
    if (nota.status === 'canceled') return nota
    if (nota.status !== 'issued' || !nota.accessKey) throw notaError(409, `nota is ${nota.status}, not issued`)
    const xml = buildCancellation({
      environment: config.environment,
      issuer: config.issuer,
      accessKey: nota.accessKey,
      at: new Date(now().getTime() - CLOCK_SKEW_MS),
      reasonCode: reason.code ?? '2',
      reason: reason.text ?? 'Venda cancelada e valor devolvido ao cliente',
    })
    const result = await gov.sendEvent(sefin, nota.accessKey, xml)
    if (!result.reached || result.status >= 500) throw notaError(502, 'government did not answer; try again')
    if (result.status < 300) return save(nota, { status: 'canceled', canceledAt: now().toISOString(), cancelErrors: undefined })
    const errors = govErrors(result.status, result.json)
    if (errors.some((error) => ALREADY_CANCELED.test(`${error.message} ${error.detail ?? ''}`))) {
      return save(nota, { status: 'canceled', canceledAt: now().toISOString(), cancelErrors: undefined })
    }
    return save(nota, { cancelErrors: errors })
  }

  /** The government's DANFSe when its service answers; otherwise our rendering of the authorized XML. */
  const pdf: Notas['pdf'] = async (id) => {
    const nota = await repo.get(id)
    if (!nota?.accessKey) return null
    const result = await gov.get(adn, `/danfse/${nota.accessKey}`)
    if (result.reached && result.status === 200 && typeof result.json.pdfB64 === 'string') {
      return Uint8Array.from(atob(result.json.pdfB64), (char) => char.charCodeAt(0))
    }
    if (!nota.nfseXml) throw notaError(502, 'DANFSe not available right now')
    return renderDanfse(nota.nfseXml, { isCanceled: nota.status === 'canceled' })
  }

  return { issue, get: (id) => repo.get(id), cancel, pdf, list: (options) => repo.list(options) }
}
