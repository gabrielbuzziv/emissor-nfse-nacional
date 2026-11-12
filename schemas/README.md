Official NFS-e Nacional XSDs, used by the tests to validate the documents we build.

- `production/`: `nfse-esquemas_xsd-v1-01-20260209.zip` (gov.br, documentação atual).
- `restricted/`: `esquemas_prod_restrita_20261020.zip` (gov.br, produção restrita; NT 009 layout).

One local edit: `production/tiposSimples_v1.01.xsd` writes the `TSSerieDPS` pattern as `^0{0,4}\d{1,5}$`.
XSD patterns have no anchors, so libxml2 (xmllint) reads `^` and `$` literally and rejects every
series; the anchors were dropped. The restricted package already ships the pattern without them.

The XSDs are official publications of the NFS-e Nacional system, included here only for the tests; the MIT
license covers the rest of the repository.
