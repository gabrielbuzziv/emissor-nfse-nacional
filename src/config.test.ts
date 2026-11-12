import { describe, expect, it } from 'vitest'
import { configFrom, configProblems, type IssuerVars } from './config'

const vars = (overrides: Partial<IssuerVars> = {}): IssuerVars => ({
  NFSE_ENVIRONMENT: 'restricted',
  ISSUER_CNPJ: '11.222.333/0001-81',
  ISSUER_CITY_CODE: '3550308',
  ISSUER_MUNICIPAL_SUBSCRIPTION: '',
  ISSUER_SIMPLES_OPTION: '3',
  ISSUER_SIMPLES_APURATION: '1',
  ISSUER_SIMPLES_TOTAL_TAX_PERCENT: '6.00',
  DPS_SERIES: '1',
  ...overrides,
})

const names = (problems: string[]): string[] => problems.map((problem) => problem.split(':')[0] ?? '')

describe('configProblems', () => {
  it('accepts a complete ME/EPP configuration', () => {
    expect(configProblems(vars())).toEqual([])
  })

  it('lists what a fresh install still has to fill in', () => {
    const fresh = vars({ ISSUER_CNPJ: '', ISSUER_CITY_CODE: '', ISSUER_SIMPLES_OPTION: '', ISSUER_SIMPLES_TOTAL_TAX_PERCENT: '' })
    expect(names(configProblems(fresh))).toEqual(['ISSUER_CNPJ', 'ISSUER_CITY_CODE', 'ISSUER_SIMPLES_OPTION'])
  })

  it('asks ME/EPP for the Simples rate in the layout format', () => {
    expect(names(configProblems(vars({ ISSUER_SIMPLES_TOTAL_TAX_PERCENT: '15,50' })))).toEqual(['ISSUER_SIMPLES_TOTAL_TAX_PERCENT'])
    expect(names(configProblems(vars({ ISSUER_SIMPLES_TOTAL_TAX_PERCENT: '' })))).toEqual(['ISSUER_SIMPLES_TOTAL_TAX_PERCENT'])
    expect(configProblems(vars({ ISSUER_SIMPLES_TOTAL_TAX_PERCENT: '15.50' }))).toEqual([])
  })

  it('does not ask MEI or non-opted-in issuers for the Simples fields', () => {
    for (const option of ['1', '2']) {
      expect(configProblems(vars({ ISSUER_SIMPLES_OPTION: option, ISSUER_SIMPLES_APURATION: '', ISSUER_SIMPLES_TOTAL_TAX_PERCENT: '' }))).toEqual([])
    }
  })

  it('accepts only the two government environments', () => {
    expect(names(configProblems(vars({ NFSE_ENVIRONMENT: 'homologacao' })))).toEqual(['NFSE_ENVIRONMENT'])
    expect(names(configProblems(vars({ NFSE_ENVIRONMENT: 'toString' })))).toEqual(['NFSE_ENVIRONMENT'])
  })

  it('checks the city code and the series', () => {
    expect(names(configProblems(vars({ ISSUER_CITY_CODE: '355030', DPS_SERIES: '123456' })))).toEqual(['ISSUER_CITY_CODE', 'DPS_SERIES'])
  })
})

describe('configFrom', () => {
  it('builds the issuer and leaves empty optional fields out', () => {
    expect(configFrom(vars({ ISSUER_SIMPLES_OPTION: '1', ISSUER_SIMPLES_APURATION: '', ISSUER_SIMPLES_TOTAL_TAX_PERCENT: '' }))).toEqual({
      environment: 'restricted',
      series: '1',
      issuer: {
        cnpj: '11.222.333/0001-81',
        cityCode: '3550308',
        municipalSubscription: undefined,
        simplesNacionalOption: '1',
        simplesNacionalApuration: undefined,
        simplesNacionalTotalTaxPercent: undefined,
      },
    })
  })

  it('refuses incomplete vars with a 500 that names them', () => {
    expect(() => configFrom(vars({ ISSUER_CNPJ: '' }))).toThrow(expect.objectContaining({ status: 500, message: expect.stringMatching(/ISSUER_CNPJ/) }))
  })
})
