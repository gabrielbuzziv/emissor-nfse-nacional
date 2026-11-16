import { describe, expect, it } from 'vitest'
import { parseIssueRequest } from './request'

const address = { country: 'us', postalCode: '94105', city: 'San Francisco', region: 'CA', street: 'Market St', number: '1' }
const base = { id: 'sale-1', serviceCode: '010101', nbsCode: '115022000', description: 'Software development', valueCents: 10000 }
const exportInfo = { resultCountry: 'us', currency: '220', foreignValueCents: 1800 }

describe('parseIssueRequest', () => {
  it('accepts a taker in Brazil, as before', () => {
    expect(parseIssueRequest({ ...base, taker: { taxId: '123.456.789-09', name: 'Maria' } })).toMatchObject({ taker: { taxId: '12345678909', name: 'Maria' } })
  })

  it('accepts an export to a taker abroad, upper-casing the countries', () => {
    const request = parseIssueRequest({ ...base, taker: { name: 'Acme', abroad: { nif: '12-3456789', address } }, export: exportInfo })
    expect(request).toEqual({
      ...base,
      competence: undefined,
      taker: { name: 'Acme', abroad: { nif: '12-3456789', address: { ...address, country: 'US' } } },
      export: { resultCountry: 'US', currency: '220', foreignValueCents: 1800 },
    })
  })

  it('accepts an export to a taker in Brazil whose result is abroad', () => {
    expect(parseIssueRequest({ ...base, taker: { taxId: '12345678909', name: 'Maria' }, export: exportInfo })).toMatchObject({ export: { resultCountry: 'US' } })
  })

  it.each([
    [{ taker: { name: 'Acme', abroad: { nif: '1', address } } }, 'export: required for a taker abroad'],
    [{ nbsCode: undefined, export: exportInfo }, 'nbsCode: required for an export of services'],
    [{ taker: { name: 'Acme', abroad: { address } }, export: exportInfo }, 'taker.abroad: nif or noNifReason, one of the two'],
    [{ taker: { name: 'Acme', abroad: { nif: '1', noNifReason: '1', address } }, export: exportInfo }, 'taker.abroad: nif or noNifReason, one of the two'],
    [{ taker: { name: 'Acme', abroad: { noNifReason: '0', address } }, export: exportInfo }, 'taker.abroad.noNifReason: "1" (exempt) or "2" (not required)'],
    [{ taker: { name: 'Acme', taxId: '12345678909', abroad: { nif: '1', address } }, export: exportInfo }, 'taker: taxId or abroad, not both'],
    [{ taker: { name: 'Acme', abroad: { nif: '1', address: { ...address, country: 'BR' } } }, export: exportInfo }, 'taker.abroad.address.country: ISO 3166 alpha-2 code, not BR'],
    [{ taker: { name: 'Acme', abroad: { nif: '1', address: { ...address, region: '' } } }, export: exportInfo }, 'taker.abroad.address.region: up to 60 characters'],
    [{ export: { ...exportInfo, resultCountry: 'BR' } }, 'export.resultCountry: ISO 3166 alpha-2 code, not BR'],
    [{ export: { ...exportInfo, currency: 'USD' } }, 'export.currency: the 3-digit BACEN currency code, e.g. "220" for US dollar'],
    [{ export: { ...exportInfo, foreignValueCents: 18.5 } }, 'export.foreignValueCents: a positive integer'],
    [{ export: { ...exportInfo, mode: '0' } }, 'export.mode: "1" to "4"'],
    [{ export: { ...exportInfo, issuerSupport: '00' } }, 'export.issuerSupport: "01" to "08"'],
    [{ export: { ...exportInfo, takerSupport: '27' } }, 'export.takerSupport: "01" to "26"'],
  ])('rejects %j', (overrides, message) => {
    expect(parseIssueRequest({ ...base, ...overrides })).toBe(message)
  })
})
