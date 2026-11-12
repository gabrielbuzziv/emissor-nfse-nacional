import { readFileSync, writeFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { publicLookupUrl, renderDanfse } from './danfse'
import { buildDps } from './dps'

const accessKey = '35503082211222333000181000000000000126111234567890'

/** An authorized NFS-e around a DPS we build, shaped like the government's answer. */
const nfseXml = (): string => {
  const { xml } = buildDps({
    environment: 'production',
    issuer: { cnpj: '11222333000181', cityCode: '3550308', simplesNacionalOption: '3', simplesNacionalApuration: '1', simplesNacionalTotalTaxPercent: '6.00' },
    series: '1',
    number: 1,
    issuedAt: new Date('2026-11-12T21:17:27Z'),
    competence: '2026-11-10',
    taker: { taxId: '12345678909', name: 'Maria & João Silva', email: 'maria@example.com' },
    serviceCode: '080201',
    nbsCode: '122051900',
    description: 'Curso online “Fotografia & Luz” – plano anual – pedido 1001',
    valueCents: 4000,
  })
  return (
    `<?xml version="1.0" encoding="utf-8"?><NFSe versao="1.01" xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS${accessKey}">` +
    '<xLocEmi>São Paulo</xLocEmi><xLocPrestacao>São Paulo</xLocPrestacao><nNFSe>1</nNFSe><xLocIncid>São Paulo</xLocIncid>' +
    '<xTribNac>Instrução, treinamento.</xTribNac><xNBS>Outros serviços de educação</xNBS><cStat>100</cStat><dhProc>2026-11-12T18:18:29-03:00</dhProc>' +
    '<emit><CNPJ>11222333000181</CNPJ><xNome>EMPRESA EXEMPLO LTDA</xNome><enderNac><xLgr>RUA EXEMPLO</xLgr><nro>100</nro><xBairro>CENTRO</xBairro><cMun>3550308</cMun><UF>SP</UF><CEP>01001000</CEP></enderNac></emit>' +
    `<valores><vLiq>40.00</vLiq></valores>${xml.replace(/<\?xml[^>]*>/, '')}</infNFSe></NFSe>`
  )
}

describe('renderDanfse', () => {
  it('renders a one-page PDF of the nota', async () => {
    const bytes = await renderDanfse(nfseXml())
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
  })

  it('renders a canceled nota too', async () => {
    expect((await renderDanfse(nfseXml(), { isCanceled: true })).byteLength).toBeGreaterThan(1000)
  })

  it('points the QR code to the public lookup of the access key', () => {
    expect(publicLookupUrl(accessKey)).toBe(`https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${accessKey}`)
  })

  // Writes a real nota's PDF for a visual check: DANFSE_XML=<nfse.xml> DANFSE_OUT=<out.pdf> pnpm test danfse
  it.runIf(process.env.DANFSE_XML)('renders the given XML for a visual check', async () => {
    writeFileSync(String(process.env.DANFSE_OUT), await renderDanfse(readFileSync(String(process.env.DANFSE_XML), 'utf8')))
  })
})
