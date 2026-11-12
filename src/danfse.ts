import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'
import { encode } from 'uqr'
import { xmlValue } from './dps'

/**
 * Our own rendering of the NFS-e (DANFSe) from the authorized XML, used when the government's DANFSe
 * service does not answer. The XML is the legal document; this PDF only presents it, with a QR code to
 * the government's public lookup, where anyone can check it.
 */

export const publicLookupUrl = (accessKey: string): string => `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${accessKey}`

const PAGE = { width: 595.28, height: 841.89, margin: 40 }
const GRAY = rgb(0.4, 0.4, 0.4)
const LINE = rgb(0.8, 0.8, 0.8)
const BLACK = rgb(0.07, 0.07, 0.07)

const OP_SIMPLES: Record<string, string> = {
  '1': 'Não optante',
  '2': 'Optante – Microempreendedor Individual (MEI)',
  '3': 'Optante – Microempresa ou Empresa de Pequeno Porte (ME/EPP)',
}
const TRIB_ISSQN: Record<string, string> = { '1': 'Operação tributável', '2': 'Imunidade', '3': 'Exportação de serviço', '4': 'Não incidência' }
const RET_ISSQN: Record<string, string> = { '1': 'Não retido', '2': 'Retido pelo tomador', '3': 'Retido pelo intermediário' }

/** The part of the XML between `<tag>` and `</tag>`, so fields of the provider and the taker do not mix. */
const section = (xml: string, tag: string): string => xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`))?.[1] ?? ''

const unescapeXml = (text: string): string =>
  text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

const field = (xml: string, tag: string): string => unescapeXml(xmlValue(xml, tag) ?? '')

const formatCnpj = (value: string): string => value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
const formatCpf = (value: string): string => value.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
const formatTaxId = (xml: string): string => {
  const cnpj = field(xml, 'CNPJ')
  if (cnpj) return `CNPJ ${formatCnpj(cnpj)}`
  const cpf = field(xml, 'CPF')
  return cpf ? `CPF ${formatCpf(cpf)}` : 'Não identificado'
}
const formatMoney = (value: string): string =>
  value ? `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'
const formatDate = (value: string): string => (value ? value.slice(0, 10).split('-').reverse().join('/') : '—')
const formatDateTime = (value: string): string => (value ? `${formatDate(value)} ${value.slice(11, 19)}` : '—')
const formatServiceCode = (value: string): string => value.replace(/^(\d{2})(\d{2})(\d{2})$/, '$1.$2.$3')
const formatAccessKey = (value: string): string => value.replace(/(\d{5})(?=\d)/g, '$1 ')

/** Splits `text` into lines that fit `width` at `size`. */
const wrap = (text: string, font: PDFFont, size: number, width: number): string[] =>
  text.split(/\s+/).reduce<string[]>((lines, word) => {
    const last = lines.at(-1)
    const candidate = last ? `${last} ${word}` : word
    if (last !== undefined && font.widthOfTextAtSize(candidate, size) > width) return [...lines, word]
    return [...lines.slice(0, -1), candidate]
  }, [])

interface Pen {
  page: PDFPage
  regular: PDFFont
  bold: PDFFont
  y: number
}

const heading = (pen: Pen, title: string): void => {
  pen.y -= 18
  pen.page.drawText(title.toUpperCase(), { x: PAGE.margin, y: pen.y, size: 8, font: pen.bold, color: GRAY })
  pen.y -= 5
  pen.page.drawLine({ start: { x: PAGE.margin, y: pen.y }, end: { x: PAGE.width - PAGE.margin, y: pen.y }, thickness: 0.6, color: LINE })
  pen.y -= 13
}

/** Label/value pairs, two per row. */
const grid = (pen: Pen, pairs: ReadonlyArray<readonly [string, string]>): void => {
  const column = (PAGE.width - 2 * PAGE.margin) / 2
  for (let index = 0; index < pairs.length; index += 2) {
    const row = pairs.slice(index, index + 2)
    const heights = row.map(([label, value], offset) => {
      const x = PAGE.margin + offset * column
      pen.page.drawText(label, { x, y: pen.y, size: 7, font: pen.regular, color: GRAY })
      const lines = wrap(value || '—', pen.regular, 9, column - 12)
      lines.forEach((line, lineIndex) => pen.page.drawText(line, { x, y: pen.y - 11 - lineIndex * 11, size: 9, font: pen.regular, color: BLACK }))
      return 11 + lines.length * 11
    })
    pen.y -= Math.max(...heights) + 6
  }
}

const paragraph = (pen: Pen, text: string, size = 9): void => {
  for (const line of wrap(text, pen.regular, size, PAGE.width - 2 * PAGE.margin)) {
    pen.page.drawText(line, { x: PAGE.margin, y: pen.y, size, font: pen.regular, color: BLACK })
    pen.y -= size + 3
  }
}

const drawQr = (page: PDFPage, text: string, x: number, top: number, size: number): void => {
  const { data } = encode(text, { ecc: 'M', border: 0 })
  const cell = size / data.length
  data.forEach((row, rowIndex) =>
    row.forEach((isDark, columnIndex) => {
      if (isDark) page.drawRectangle({ x: x + columnIndex * cell, y: top - (rowIndex + 1) * cell, width: cell, height: cell, color: BLACK })
    }),
  )
}

export const renderDanfse = async (nfseXml: string, options: { isCanceled?: boolean } = {}): Promise<Uint8Array> => {
  const pdf = await PDFDocument.create()
  pdf.setTitle('DANFSe – Documento Auxiliar da NFS-e')
  const page = pdf.addPage([PAGE.width, PAGE.height])
  const pen: Pen = { page, regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold), y: PAGE.height - PAGE.margin }

  const accessKey = nfseXml.match(/<infNFSe Id="NFS(\d{50})"/)?.[1] ?? ''
  const dps = section(nfseXml, 'infDPS')
  const emitter = section(nfseXml, 'emit')
  const address = section(emitter, 'enderNac')
  const taker = section(dps, 'toma')
  const service = section(dps, 'serv')
  const values = section(dps, 'valores')
  const regime = section(dps, 'regTrib')

  // Header: title, number and the QR code to the public lookup.
  const qrSize = 78
  drawQr(page, publicLookupUrl(accessKey), PAGE.width - PAGE.margin - qrSize, pen.y, qrSize)
  page.drawText('DANFSe', { x: PAGE.margin, y: pen.y - 16, size: 18, font: pen.bold, color: BLACK })
  page.drawText('Documento Auxiliar da Nota Fiscal de Serviço Eletrônica', { x: PAGE.margin, y: pen.y - 32, size: 9, font: pen.regular, color: GRAY })
  page.drawText(`NFS-e nº ${field(nfseXml, 'nNFSe')}`, { x: PAGE.margin, y: pen.y - 54, size: 13, font: pen.bold, color: BLACK })
  page.drawText(`Emitida em ${formatDateTime(field(nfseXml, 'dhProc'))}  ·  Competência ${formatDate(field(dps, 'dCompet'))}`, {
    x: PAGE.margin,
    y: pen.y - 70,
    size: 9,
    font: pen.regular,
    color: BLACK,
  })
  pen.y -= qrSize + 14
  page.drawText('Chave de acesso', { x: PAGE.margin, y: pen.y, size: 7, font: pen.regular, color: GRAY })
  page.drawText(formatAccessKey(accessKey), { x: PAGE.margin, y: pen.y - 11, size: 9, font: pen.bold, color: BLACK })
  page.drawText('Consulte em nfse.gov.br/ConsultaPublica', { x: PAGE.width - PAGE.margin - 160, y: pen.y - 11, size: 7, font: pen.regular, color: GRAY })
  pen.y -= 18
  if (options.isCanceled) {
    pen.y -= 6
    page.drawText('NFS-e CANCELADA', { x: PAGE.margin, y: pen.y, size: 14, font: pen.bold, color: rgb(0.75, 0.1, 0.1) })
    pen.y -= 6
  }

  heading(pen, 'Prestador do serviço')
  grid(pen, [
    ['Nome / razão social', field(emitter, 'xNome')],
    ['CNPJ / CPF', formatTaxId(emitter)],
    ['Endereço', [field(address, 'xLgr'), field(address, 'nro'), field(address, 'xBairro')].filter(Boolean).join(', ')],
    ['Município', `${field(nfseXml, 'xLocEmi')} – ${field(address, 'UF')}${field(address, 'CEP') ? `, CEP ${field(address, 'CEP').replace(/^(\d{5})(\d{3})$/, '$1-$2')}` : ''}`],
    ['Simples Nacional', OP_SIMPLES[field(regime, 'opSimpNac')] ?? '—'],
    ['Inscrição municipal', field(emitter, 'IM') || '—'],
  ])

  heading(pen, 'Tomador do serviço')
  grid(pen, [
    ['Nome / razão social', field(taker, 'xNome') || 'Não identificado'],
    ['CNPJ / CPF', taker ? formatTaxId(taker) : 'Não identificado'],
    ['E-mail', field(taker, 'email')],
  ])

  heading(pen, 'Serviço prestado')
  grid(pen, [
    ['Código de tributação nacional', `${formatServiceCode(field(service, 'cTribNac'))} – ${field(nfseXml, 'xTribNac')}`],
    ['NBS', field(service, 'cNBS') ? `${field(service, 'cNBS')} – ${field(nfseXml, 'xNBS')}` : '—'],
    ['Local da prestação', field(nfseXml, 'xLocPrestacao')],
    ['Município de incidência do ISSQN', field(nfseXml, 'xLocIncid')],
  ])
  page.drawText('Descrição', { x: PAGE.margin, y: pen.y, size: 7, font: pen.regular, color: GRAY })
  pen.y -= 11
  paragraph(pen, field(service, 'xDescServ'))

  heading(pen, 'Tributação e valores')
  const simplesRate = field(values, 'pTotTribSN')
  grid(pen, [
    ['Valor do serviço', formatMoney(field(values, 'vServ'))],
    ['Valor líquido', formatMoney(field(nfseXml, 'vLiq'))],
    ['Tributação do ISSQN', TRIB_ISSQN[field(values, 'tribISSQN')] ?? '—'],
    ['Retenção do ISSQN', RET_ISSQN[field(values, 'tpRetISSQN')] ?? '—'],
    ['Tributos aproximados (Lei 12.741/2012)', simplesRate ? `${simplesRate.replace('.', ',')}% do Simples Nacional` : '—'],
  ])

  pen.y = PAGE.margin + 24
  paragraph(
    pen,
    'Este documento é uma representação da NFS-e. A nota fiscal válida é o arquivo XML autorizado pelo Sistema Nacional NFS-e, que pode ser consultado pela chave de acesso ou pelo QR code acima.',
    7,
  )
  return pdf.save()
}
