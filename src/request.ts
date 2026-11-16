import type { ServiceExport, Taker } from './dps'
import type { IssueRequest } from './notas'

const isText = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max

const COUNTRY = /^[A-Z]{2}$/

const parseTaker = (taker: unknown): Taker | string => {
  const { taxId, abroad, name, email } = (taker ?? {}) as Record<string, unknown>
  if (typeof name !== 'string' || !name.trim()) return 'taker.name: required'
  if (email !== undefined && typeof email !== 'string') return 'taker.email: a string'
  const contact = { name, ...(email ? { email } : {}) }
  if (abroad === undefined) {
    const taxDigits = typeof taxId === 'string' ? taxId.replace(/\D/g, '') : ''
    if (taxDigits.length !== 11 && taxDigits.length !== 14) return 'taker.taxId: a CPF or CNPJ (or taker.abroad for a taker outside Brazil)'
    return { taxId: taxDigits, ...contact }
  }
  if (taxId !== undefined) return 'taker: taxId or abroad, not both'
  const { nif, noNifReason, address } = (abroad ?? {}) as Record<string, unknown>
  if ((nif === undefined) === (noNifReason === undefined)) return 'taker.abroad: nif or noNifReason, one of the two'
  if (nif !== undefined && !isText(nif, 40)) return 'taker.abroad.nif: up to 40 characters'
  if (noNifReason !== undefined && noNifReason !== '1' && noNifReason !== '2') return 'taker.abroad.noNifReason: "1" (exempt) or "2" (not required)'
  const { country, postalCode, city, region, street, number, complement, district } = (address ?? {}) as Record<string, unknown>
  if (typeof country !== 'string' || !COUNTRY.test(country.toUpperCase()) || country.toUpperCase() === 'BR') return 'taker.abroad.address.country: ISO 3166 alpha-2 code, not BR'
  if (!isText(postalCode, 11)) return 'taker.abroad.address.postalCode: up to 11 characters'
  if (!isText(city, 60)) return 'taker.abroad.address.city: up to 60 characters'
  if (!isText(region, 60)) return 'taker.abroad.address.region: up to 60 characters'
  if (!isText(street, 255)) return 'taker.abroad.address.street: up to 255 characters'
  if (!isText(number, 60)) return 'taker.abroad.address.number: up to 60 characters'
  if (complement !== undefined && !isText(complement, 156)) return 'taker.abroad.address.complement: up to 156 characters'
  if (district !== undefined && !isText(district, 60)) return 'taker.abroad.address.district: up to 60 characters'
  return {
    ...contact,
    abroad: {
      ...(nif !== undefined ? { nif: nif as string } : { noNifReason: noNifReason as '1' | '2' }),
      address: {
        country: country.toUpperCase(),
        postalCode,
        city,
        region,
        street,
        number,
        ...(complement ? { complement: complement as string } : {}),
        ...(district ? { district: district as string } : {}),
      },
    },
  }
}

const parseExport = (value: unknown): ServiceExport | string => {
  const { resultCountry, currency, foreignValueCents, mode, relationship, issuerSupport, takerSupport, shareWithMdic } = (value ?? {}) as Record<string, unknown>
  if (typeof resultCountry !== 'string' || !COUNTRY.test(resultCountry.toUpperCase()) || resultCountry.toUpperCase() === 'BR')
    return 'export.resultCountry: ISO 3166 alpha-2 code, not BR'
  if (typeof currency !== 'string' || !/^\d{3}$/.test(currency)) return 'export.currency: the 3-digit BACEN currency code, e.g. "220" for US dollar'
  if (typeof foreignValueCents !== 'number' || !Number.isInteger(foreignValueCents) || foreignValueCents <= 0) return 'export.foreignValueCents: a positive integer'
  if (mode !== undefined && !['1', '2', '3', '4'].includes(mode as string)) return 'export.mode: "1" to "4"'
  if (relationship !== undefined && !['0', '1', '2', '3', '4', '5', '6'].includes(relationship as string)) return 'export.relationship: "0" to "6"'
  if (issuerSupport !== undefined && (typeof issuerSupport !== 'string' || !/^0[1-8]$/.test(issuerSupport))) return 'export.issuerSupport: "01" to "08"'
  if (takerSupport !== undefined && (typeof takerSupport !== 'string' || !/^(0[1-9]|1\d|2[0-6])$/.test(takerSupport))) return 'export.takerSupport: "01" to "26"'
  if (shareWithMdic !== undefined && typeof shareWithMdic !== 'boolean') return 'export.shareWithMdic: a boolean'
  return {
    resultCountry: resultCountry.toUpperCase(),
    currency,
    foreignValueCents,
    ...(mode ? { mode: mode as ServiceExport['mode'] } : {}),
    ...(relationship ? { relationship: relationship as ServiceExport['relationship'] } : {}),
    ...(issuerSupport ? { issuerSupport } : {}),
    ...(takerSupport ? { takerSupport } : {}),
    ...(shareWithMdic !== undefined ? { shareWithMdic } : {}),
  }
}

/** Checks the body of `POST /v1/notas`; returns the request or what is wrong with it. */
export const parseIssueRequest = (body: unknown): IssueRequest | string => {
  if (!body || typeof body !== 'object') return 'body must be a JSON object'
  const { id, competence, taker, serviceCode, nbsCode, description, valueCents, export: exportInfo } = body as Record<string, unknown>
  if (typeof id !== 'string' || !id || id.length > 200) return 'id: a string up to 200 characters'
  if (competence !== undefined && (typeof competence !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(competence))) return 'competence: YYYY-MM-DD'
  if (typeof serviceCode !== 'string' || !/^\d{6}$/.test(serviceCode)) return 'serviceCode: the 6-digit national code (cTribNac)'
  if (nbsCode !== undefined && (typeof nbsCode !== 'string' || !/^\d{9}$/.test(nbsCode))) return 'nbsCode: the 9-digit NBS code'
  if (typeof description !== 'string' || !description.trim()) return 'description: required'
  if (typeof valueCents !== 'number' || !Number.isInteger(valueCents) || valueCents <= 0) return 'valueCents: a positive integer'
  const request: IssueRequest = { id, competence: competence as string | undefined, serviceCode, nbsCode: nbsCode as string | undefined, description, valueCents }
  if (taker !== undefined) {
    const parsed = parseTaker(taker)
    if (typeof parsed === 'string') return parsed
    request.taker = parsed
  }
  if (exportInfo !== undefined) {
    const parsed = parseExport(exportInfo)
    if (typeof parsed === 'string') return parsed
    request.export = parsed
  }
  // Rules E0330 and E0318: a taker abroad makes it foreign trade, which needs the comExt group and an NBS code.
  if (request.taker?.abroad && !request.export) return 'export: required for a taker abroad'
  if (request.export && !nbsCode) return 'nbsCode: required for an export of services'
  return request
}
