import { hosts, type Environment, type Issuer } from './dps'
import { notaError, type Config } from './notas'

/** The `vars` of wrangler.jsonc that describe the issuer. */
export type IssuerVars = Pick<
  Env,
  | 'NFSE_ENVIRONMENT'
  | 'ISSUER_CNPJ'
  | 'ISSUER_CITY_CODE'
  | 'ISSUER_MUNICIPAL_SUBSCRIPTION'
  | 'ISSUER_SIMPLES_OPTION'
  | 'ISSUER_SIMPLES_APURATION'
  | 'ISSUER_SIMPLES_TOTAL_TAX_PERCENT'
  | 'DPS_SERIES'
>

/** pTotTribSN in the layout (TSDec2V2): up to 2 digits and, optionally, 2 decimals. */
const SIMPLES_RATE = /^(0|0\.\d{2}|[1-9]\d?(\.\d{2})?)$/

/** What is missing or wrong in the vars, so a new install fails with a clear message instead of a rejected nota. */
export const configProblems = (vars: IssuerVars): string[] => {
  const isMeEpp = vars.ISSUER_SIMPLES_OPTION === '3'
  const checks: Array<[boolean, string]> = [
    [Object.keys(hosts).includes(vars.NFSE_ENVIRONMENT), 'NFSE_ENVIRONMENT: "production" or "restricted"'],
    [/^\d{14}$/.test((vars.ISSUER_CNPJ ?? '').replace(/\D/g, '')), 'ISSUER_CNPJ: the 14 digits of the CNPJ'],
    [/^\d{7}$/.test(vars.ISSUER_CITY_CODE ?? ''), 'ISSUER_CITY_CODE: the 7-digit IBGE code of the city'],
    [['1', '2', '3'].includes(vars.ISSUER_SIMPLES_OPTION), 'ISSUER_SIMPLES_OPTION: 1 (not opted in), 2 (MEI) or 3 (ME/EPP)'],
    [!isMeEpp || ['1', '2', '3'].includes(vars.ISSUER_SIMPLES_APURATION), 'ISSUER_SIMPLES_APURATION: 1, 2 or 3'],
    [!isMeEpp || SIMPLES_RATE.test(vars.ISSUER_SIMPLES_TOTAL_TAX_PERCENT ?? ''), 'ISSUER_SIMPLES_TOTAL_TAX_PERCENT: the approximate Simples rate, e.g. "6.00"'],
    [/^\d{1,5}$/.test(vars.DPS_SERIES ?? ''), 'DPS_SERIES: up to 5 digits'],
  ]
  return checks.filter(([isValid]) => !isValid).map(([, problem]) => problem)
}

export const configFrom = (vars: IssuerVars): Config => {
  const problems = configProblems(vars)
  if (problems.length) throw notaError(500, `fix the vars in wrangler.jsonc: ${problems.join('; ')}`)
  const issuer: Issuer = {
    cnpj: vars.ISSUER_CNPJ,
    cityCode: vars.ISSUER_CITY_CODE,
    municipalSubscription: vars.ISSUER_MUNICIPAL_SUBSCRIPTION || undefined,
    simplesNacionalOption: vars.ISSUER_SIMPLES_OPTION as Issuer['simplesNacionalOption'],
    simplesNacionalApuration: (vars.ISSUER_SIMPLES_APURATION || undefined) as Issuer['simplesNacionalApuration'],
    simplesNacionalTotalTaxPercent: vars.ISSUER_SIMPLES_TOTAL_TAX_PERCENT || undefined,
  }
  return { environment: vars.NFSE_ENVIRONMENT as Environment, issuer, series: vars.DPS_SERIES }
}
