import { createHash, createSign } from 'node:crypto'

const DSIG = 'http://www.w3.org/2000/09/xmldsig#'
const NS = 'http://www.sped.fazenda.gov.br/nfse'
const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'

/**
 * Signs the element carrying `Id` (infDPS, infPedReg). The Worker writes the XML already in canonical
 * form (no whitespace between tags, no self-closing tags, escaped text, default namespace on the root
 * only), so the signed element's canonical form is its text plus the inherited namespace declaration.
 */
export const signXml = (xml, keyPem, certB64) => {
  const match = xml.match(/<(inf[A-Za-z]+) Id="([^"]+)">[\s\S]*<\/\1>/)
  if (!match) throw new Error('no element with Id to sign')
  const [element, name, id] = match
  const canonical = element.replace(`<${name} Id=`, `<${name} xmlns="${NS}" Id=`)
  const digest = createHash('sha256').update(canonical).digest('base64')
  const signedInfo =
    `<CanonicalizationMethod Algorithm="${C14N}"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></SignatureMethod>` +
    `<Reference URI="#${id}"><Transforms>` +
    `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform>` +
    `<Transform Algorithm="${C14N}"></Transform></Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></DigestMethod>` +
    `<DigestValue>${digest}</DigestValue></Reference>`
  const value = createSign('RSA-SHA256').update(`<SignedInfo xmlns="${DSIG}">${signedInfo}</SignedInfo>`).sign(keyPem, 'base64')
  const signature =
    `<Signature xmlns="${DSIG}"><SignedInfo>${signedInfo}</SignedInfo><SignatureValue>${value}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${certB64}</X509Certificate></X509Data></KeyInfo></Signature>`
  const rootClose = xml.lastIndexOf('</')
  return xml.slice(0, rootClose) + signature + xml.slice(rootClose)
}

