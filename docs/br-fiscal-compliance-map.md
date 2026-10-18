# Brazilian Fiscal Compliance Map for PayCrew

**Purpose:** implementation-oriented reference for engineering, so architecture decisions (data model, integrations, per-entity config) don't paint the product into a corner. **This is not tax/legal advice.** Every flagged decision below must be validated with a Brazilian accountant (contador) and, ideally, a tax lawyer before building the related feature, because PayCrew's actual obligations depend on how the company is legally structured (pure payment intermediary vs. co-responsible tomador de serviço vs. marketplace issuing on behalf of agencies) and that structuring choice hasn't been made yet.

---

## 1. The core distinction: who is obligated, for what, to whom

PayCrew sits between three actors, each with **separate and non-interchangeable** fiscal obligations:

1. **PayCrew itself** (the SaaS/intermediation platform) — owes tax/documents for the fee it charges agencies for using the platform.
2. **Event agencies** (PayCrew's customers) — as _tomadoras de serviço_, they may have withholding and documentation duties when paying freelancers, independent of whatever PayCrew does.
3. **Freelancers** (paid via the platform) — as service providers (pessoa física or pessoa jurídica), they have their own document-issuance obligations depending on their legal status.

There is no single "fiscal flow" that covers all three — the correct document and process differs by **which leg of the money movement** you're looking at, and by the **legal nature of the payee** (PF autônomo, MEI, ME/EPP, PJ regular). Treating this as one undifferentiated flow is the most common and costly implementation mistake.

---

## 2. What DANFE actually is (and what it is NOT)

- **DANFE (Documento Auxiliar da Nota Fiscal Eletrônica)** is a **printed/graphic representation** of an **NF-e (Nota Fiscal Eletrônica, modelo 55)** — it is not itself a fiscal document, it's an auxiliary/visual proof that an NF-e exists and was authorized. It contains the 44-digit access key, a barcode, and summary data (issuer, recipient, values) [1](https://portalsped.fazenda.mg.gov.br/spedmg/nfe/Perguntas-Frequentes/respostas_v/index.html) [3](https://www.fazenda.sp.gov.br/nfe/perguntas_frequentes/respostas_V.asp).
- **NF-e / DANFE apply to the circulation of goods (mercadorias)** — state-level (ICMS), used when merchandise physically moves and must be accompanied by a document during transit [3](https://www.fazenda.sp.gov.br/nfe/perguntas_frequentes/respostas_V.asp).
- **PayCrew does not sell or move physical goods.** It intermediates _services_ (freelancer labor for events) and charges a _platform/service fee_. **NF-e/DANFE is very likely NOT the applicable document for PayCrew's core business** — this is a common confusion because DANFE is the most publicly recognizable "nota fiscal" artifact in Brazil, but it belongs to the goods/ICMS universe, not services/ISS.
- The document that actually matters for a services-based platform like PayCrew is the **NFS-e (Nota Fiscal de Serviços Eletrônica)** — municipal ISS-based today, migrating to a **national standard NFS-e** run by the federal Comitê Gestor (CGNFS-e) under Receita Federal, per LC 214/2025 and CGNFS-e Resolution nº 3/2023 [gov.br NFS-e portal](https://www.gov.br/nfse/pt-br) [Resolução CGNFS-e nº3](https://www.gov.br/nfse/pt-br/biblioteca/portarias-e-resolucoes-cgnfs-e/resolucaocgnfsen330082023.pdf).
- **Only build DANFE/NF-e support if an accountant confirms PayCrew (or an agency) sells/moves goods** (e.g., merchandise, equipment) as part of billing — otherwise it's out of scope and should not appear anywhere in the product's fiscal model.

---

## 3. NFS-e (national standard): what applies to PayCrew's fee-charging

- The **NFS-e padrão nacional** is a federally standardized services invoice, replacing fragmented municipal systems, run via the Ambiente de Dados Nacional (ADN)/Receita Federal, with municipal adhesion via convênio [gov.br project page](https://www.gov.br/nfse/pt-br/nfse/conheca/o-projeto-nfs-e).
- It is legally valid nationwide, and where a municipality has adhered, it **substitutes** the old municipal system [gov.br service page](https://www.gov.br/pt-br/servicos/emitir-nota-fiscal-de-servico-eletronica).
- It can be emitted via: (a) the government's web portal (Portal do Contribuinte / Emissor Web), (b) a mobile app, or (c) **API integration**, which requires prior credential registration ("credenciamento prévio no Painel do Contribuinte") — this is the technical integration path relevant to PayCrew [gov.br service page](https://www.gov.br/pt-br/servicos/emitir-nota-fiscal-de-servico-eletronica).
- **If PayCrew (as a CNPJ) charges agencies a platform/intermediation fee, PayCrew itself is the prestador de serviço for that fee and is very likely obligated to issue NFS-e for it** — subject to its own municipality's adhesion status and its tax regime (Simples Nacional, Lucro Presumido, etc., each with different ISS handling). This must be confirmed with an accountant based on PayCrew's actual CNPJ registration, activity code (CNAE), and municipality.
- Adoption is uneven and rapidly evolving: capitals like São Paulo, Curitiba, Florianópolis, and São Luís have already made NFS-e mandatory even for autonomous individuals with habitual activity; others (Rio de Janeiro, Belo Horizonte) still treat it as optional as of mid-2026 [2](https://www.contabilizei.com.br/reforma-tributaria/artigo/rpa-ou-nota-fiscal/). **This is a moving target and must be re-checked at build time, not assumed static.**

---

## 4. RPA (Recibo de Pagamento Autônomo) — the freelancer-without-CNPJ case

- **RPA** is the traditional document used when a **pessoa física without CNPJ** provides eventual/non-habitual services to a company. The **contracting company (tomador)** issues it, and is responsible as the withholding agent for **INSS, IRRF, and (where applicable) ISS** on the payment [Serasa Experian](https://www.serasaexperian.com.br/conteudos/recibo-de-pagamento-para-autonomos/) [iure.digital](https://iure.digital/blog/recibo-de-pagamento-autonomo-rpa-obrigacoes-riscos-e-tributos/).
- Many freelancers on an events platform will fall into exactly this category (PF, no CNPJ, sporadic gigs) — meaning **the agency (tomador), not PayCrew, is traditionally the one legally responsible for RPA issuance and withholding**, unless PayCrew contractually and fiscally inserts itself as an intermediary/agent of record.
- **Major regulatory shift in progress (as of 2026):** RPA is being phased out as the primary document in favor of the **NFS-e nacional**, which the freelancer (pessoa física) would emit themselves, covering ISS, IR, INSS, and other taxes in one document [1](https://assolari.com.br/atualidades/substituicao-do-rpa-pela-nfs-e-nacional-em-2026-o-que-voce-precisa-saber/) [3](https://atczanardicontabilidade.com.br/rpa-deixa-de-ser-valido-em-2026-entenda-a-obrigatoriedade-da-nfs-e-para-autonomos/). However, industry sources disagree on timing and universality: some say RPA is fully replaced from Jan 1, 2026 nationally; others say RPA still exists for labor/eSocial purposes and NFS-e-for-autônomos obligation is being rolled out **city by city**, not uniformly nationwide [2](https://www.contabilizei.com.br/reforma-tributaria/artigo/rpa-ou-nota-fiscal/). **This is contested/unsettled even among accounting firms — do not hard-code either "RPA only" or "NFS-e only" logic; treat it as a per-municipality, time-varying rule set confirmed by counsel, not a fixed constant in code.**
- Legal risk distinct from tax: **habitual/recurring use of RPA for the same freelancer can trigger CLT employment-relationship (vínculo empregatício) characterization risk** [iure.digital](https://iure.digital/blog/recibo-de-pagamento-autonomo-rpa-obrigacoes-riscos-e-tributos/). This is a labor-law exposure for the **agency**, and potentially for PayCrew if it is deemed to function as the de facto employer/intermediary — flag for legal review, not just tax.

---

## 5. Fiscal issuer vs. payment provider — a distinction the architecture must preserve

| Role                                                                                                       | What it does                                                                                                                                | What it must NOT be conflated with                                                                                            |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Payment provider / payment intermediary (e.g., PayCrew's money-movement layer, PSPs, banking partners)** | Moves money, settles funds, may act as a payment institution regulated by BACEN                                                             | Does not, by itself, issue tax documents (NFS-e/RPA/NF-e)                                                                     |
| **Fiscal issuer**                                                                                          | Legally responsible party who emits the NFS-e/RPA for a given transaction (could be the agency, the freelancer, or PayCrew for its own fee) | Is not automatically whoever moves the money — fiscal responsibility follows the _service relationship_, not the payment rail |

- PayCrew must not assume that "processing the payment" implies "PayCrew is the correct fiscal issuer" for the freelancer-agency relationship. In most current setups, **PayCrew is the fiscal issuer only for its own fee to the agency**; the agency-freelancer service relationship's fiscal documentation (RPA or freelancer-emitted NFS-e) is a separate legal relationship, unless PayCrew's contracts and BACEN/legal structuring explicitly make it an agent/mandatary for tax purposes.
- **Decision required with legal/accounting counsel:** should PayCrew (a) remain a pure payment/software intermediary and leave RPA/NFS-e issuance between agency and freelancer entirely outside the platform (lowest fiscal exposure, less product completeness), or (b) build the platform as an active facilitator that generates/pre-fills RPA data or triggers NFS-e emission on behalf of users (higher product value, but creates potential co-responsibility, requires contractual mandate structures, and possibly a fiscal API integration and record-keeping obligations)? This is a strategic, not purely technical, decision.

---

## 6. What must be configurable per legal entity (do not hard-code)

Each **agency** (tomador) and each **freelancer** (prestador) is a distinct legal entity/taxpayer profile. The data model must support, per entity, at minimum:

- **CPF/CNPJ** and cadastral status (ativo/inapto at Receita Federal)
- **Tax regime** where relevant: Simples Nacional, MEI, Lucro Presumido, Lucro Real (affects ISS/IRRF withholding math and NFS-e fields)
- **CNAE / municipal service code (item de serviço)** — required for correct ISS rate and NFS-e classification, varies per municipality
- **Municipality of establishment** (município de prestação vs. município de domicílio) — because NFS-e rules, rates, and whether the national standard has been adopted **vary per municipality** and this changes over time (Resolução CGNFS-e updates municipal adhesion continuously)
- **Applicable document type per transaction**: RPA vs. self-issued NFS-e vs. NFS-e issued by a PJ freelancer vs. (rare) NF-e for goods — this should be a rules table, not a constant
- **Withholding obligations** (INSS, IRRF, ISS retido na fonte) — thresholds, rates and whether the payer or the payee withholds, which differ by payee type (PF autônomo vs. MEI vs. PJ) and by municipal legislation
- **Fiscal API credentials/certificates per entity** — if any entity issues via API, it needs its own digital certificate (e-CNPJ/e-CPF, ICP-Brasil) or equivalent electronic signature credential registered with the national NFS-e environment, per Resolução CGNFS-e nº 3/2023 Art. 2º [gov.br](https://www.gov.br/nfse/pt-br/biblioteca/portarias-e-resolucoes-cgnfs-e/resolucaocgnfsen330082023.pdf) — these cannot be shared across entities
- **Effective dates of obligation** — since municipal NFS-e mandatory-for-autônomos rules are rolling out city-by-city and changing through 2026+, per-entity/per-municipality "obligation start date" flags are needed, not a single global flag

---

## 7. Should PayCrew integrate a fiscal API? Framing, not a yes/no

Arguments for a **direct fiscal API integration** (national NFS-e emissor via API, per credenciamento no Painel do Contribuinte [gov.br](https://www.gov.br/pt-br/servicos/emitir-nota-fiscal-de-servico-eletronica)):

- Removes manual friction for agencies/freelancers, strengthens product stickiness
- Enables automatic reconciliation between payment and fiscal document, useful for audit trails
- The national standard is a single federal API surface (rather than 5,570 disparate municipal ones), which somewhat lowers long-term integration complexity — but only for municipalities that have adhered; non-adhered municipalities still require legacy municipal webservice integrations

Arguments for **not building it now** (or building thin, e.g., partnering with an existing fiscal-issuance provider/gateway instead of Receita Federal's API directly):

- Legal responsibility and audit exposure for **who is the declared issuer** in each NFS-e (PayCrew vs. agency vs. freelancer) needs to be settled contractually and fiscally first — building the pipe before deciding who's on it risks having to re-architect it
- Digital certificate management, per-entity credential lifecycle, and error/rejection handling (rejected NFS-e, cancellations, substituições) are non-trivial and better proven manually before automating
- The regulatory environment is actively changing (RPA→NFS-e transition, municipal adhesion timeline, reform tributária IBS/CBS effects starting 2027) [2](https://www.contabilizei.com.br/reforma-tributaria/artigo/rpa-ou-nota-fiscal/) — early automation risks embedding rules that will be obsolete within a year
- A third-party fiscal-issuance-as-a-service vendor (many exist in the Brazilian market) can absorb municipal/national API fragmentation and certificate handling, letting PayCrew integrate once against a stable vendor API instead of the shifting government layer directly

**Recommendation:** do not build a direct government fiscal API integration in an early phase. Prefer either (a) no fiscal automation — agencies/freelancers handle RPA/NFS-e outside PayCrew, with PayCrew only recording references/receipts, or (b) a vetted third-party fiscal-issuance gateway once the entity structure and issuer-of-record decision (Section 5) is settled.

---

## 8. Recommended phased scope

**Phase 0 — No fiscal automation (safe default, ship first)**

- PayCrew acts purely as software + payment intermediary
- Platform records payments and lets agencies/freelancers attach/upload their own RPA or NFS-e as a reference document for their own records; PayCrew does not generate, validate, or transmit fiscal documents
- PayCrew issues its own NFS-e for its platform fee to agencies, using its own accountant/existing invoicing process (manual or via PayCrew's bookkeeping software) — not built into freelancer payment flows
- Per-entity config limited to: CPF/CNPJ, tax regime label (informational), municipality (informational) — used for reporting/filtering, not for automated tax calculation

**Phase 1 — Structured data capture, still no transmission**

- Add structured fields for CNAE/service code, withholding fields (calculated but not filed), so agencies get a computed suggestion (e.g., "estimated INSS/IRRF to withhold") clearly labeled as **non-binding estimate, confirm with your accountant**
- Store per-entity historical documents (uploaded RPA/NFS-e PDFs/XML) for audit trail
- No API calls to any government system yet

**Phase 2 — Vendor-mediated fiscal issuance (only after legal/accounting sign-off on issuer-of-record model)**

- Integrate a third-party fiscal-issuance API/gateway for NFS-e emission, scoped only to the entity(ies) that legal/accounting confirm PayCrew may issue on behalf of (likely only PayCrew's own fee invoices first, then optionally agency-side if a formal mandate/agency agreement is signed)
- Per-entity digital certificate management, credential storage, rejection/cancellation handling
- Explicit contractual mandate language reviewed by legal for any case where PayCrew issues in the name of another entity

**Phase 3 — Direct national NFS-e API integration (only if volume/strategy justifies bypassing a vendor)**

- Direct credenciamento with the national NFS-e Painel do Contribuinte, own signature/certificate management, handling municipal-adhesion edge cases directly
- Only pursue this once Phase 2 has validated the operating model and volumes justify the added engineering/compliance overhead

**Never in early scope:** NF-e/DANFE (goods) issuance — out of scope unless the business model changes to include sale/movement of physical goods, confirmed by accountant.

---

## 9. Unresolved decisions requiring accountant/legal input before further build

1. **PayCrew's legal structuring**: is it purely a SaaS + payment facilitator, or does/will it act as an agent/mandatary issuing documents on behalf of agencies or freelancers? This single decision determines almost everything else (issuer-of-record, API scope, contractual liability).
2. **Who is the tomador de serviço for withholding purposes** in the agency-freelancer relationship, and does PayCrew's payment flow (holding/passing funds) create any co-responsibility (responsabilidade solidária) for withheld taxes (INSS/IRRF/ISS)? Needs tax counsel review of PayCrew's money-flow mechanics (does PayCrew hold funds, is it a payment institution, does it need BACEN authorization).
3. **RPA vs. NFS-e-nacional applicability timeline per municipality**: which municipalities where PayCrew's target agencies/freelancers operate have already adopted mandatory NFS-e for autônomos, and what's the realistic rollout timeline through 2027 (as reform tributária IBS/CBS phases in)? Needs ongoing accounting monitoring, not a one-time answer.
4. **Freelancer classification risk (CLT vínculo empregatício)**: under what usage patterns (frequency, exclusivity, subordination signals) could recurring RPA-based or platform-mediated freelancer engagements create employment-relationship risk for agencies or for PayCrew itself? Needs labor law review, potentially shaping product limits (e.g., max recurring engagements per freelancer-agency pair before flagging for review).
5. **Whether PayCrew itself needs BACEN registration** (Sociedade de Crédito Direto, Instituição de Pagamento, or similar) given it moves funds between agencies and freelancers — this affects both fiscal treatment and whether "payment provider" claims in the product are accurate. Needs financial-regulatory counsel, separate from fiscal/tax counsel.
6. **Tax regime of PayCrew's own CNPJ** (Simples Nacional vs. Lucro Presumido, etc.) and its impact on ISS due on the platform fee, and on which municipality's NFS-e system it must use. Needs PayCrew's own accountant.
7. **Data retention/audit requirements**: how long must PayCrew (or the agencies) retain NFS-e/RPA-related records, and does PayCrew's platform-generated data (payment records referencing fiscal documents) itself need to meet document-retention rules similar to those for DANFE/NF-e archives [Receita RS](https://atendimento.receita.rs.gov.br/ha-obrigatoriedade-da-guarda-do-danfe-emitente-e-destinatario)? Needs accountant guidance specific to services documents (NFS-e retention differs from NF-e retention rules).
8. **Reforma Tributária (IBS/CBS) transition impact**: with IBS/CBS beginning to affect autônomos' taxation from January 2027 [2](https://www.contabilizei.com.br/reforma-tributaria/artigo/rpa-ou-nota-fiscal/), what changes should be anticipated in the data model (new tax fields, new document types) before locking in a Phase 1/2 schema? Needs accountant with reforma tributária specialization, revisited close to each rollout milestone.

---

## Key sources

- [1] SPED MG — O que é e para que serve o DANFE: https://portalsped.fazenda.mg.gov.br/spedmg/nfe/Perguntas-Frequentes/respostas_v/index.html
- [3] Sefaz-SP — Modelo operacional da NF-e/DANFE: https://www.fazenda.sp.gov.br/nfe/perguntas_frequentes/respostas_V.asp
- Receita RS — Guarda do DANFE: https://atendimento.receita.rs.gov.br/ha-obrigatoriedade-da-guarda-do-danfe-emitente-e-destinatario
- CONFAZ — Manual de Especificações Técnicas do DANFE (MOC 7.0): https://www.confaz.fazenda.gov.br/legislacao/arquivo-manuais/moc7-anexo-ii-manual-especificacoes-tecnicas-danfe-codigo-barras.pdf
- Gov.br — Portal da NFS-e (padrão nacional): https://www.gov.br/nfse/pt-br
- Gov.br — O padrão nacional da NFS-e: https://www.gov.br/nfse/pt-br/nfse/conheca/o-projeto-nfs-e
- Gov.br — Serviço "Emitir NFS-e Padrão Nacional" (incl. API/credenciamento): https://www.gov.br/pt-br/servicos/emitir-nota-fiscal-de-servico-eletronica
- Gov.br — Resolução CGNFS-e nº 3/2023 (modelo da NFS-e nacional): https://www.gov.br/nfse/pt-br/biblioteca/portarias-e-resolucoes-cgnfs-e/resolucaocgnfsen330082023.pdf
- Gov.br — Resoluções e Portarias do CGNFS-e (índice, updated through 2026): https://www.gov.br/nfse/pt-br/biblioteca/portarias-e-resolucoes-cgnfs-e
- [2] Contabilizei — RPA ou Nota Fiscal em 2026 (municipal rollout status, reforma tributária timeline): https://www.contabilizei.com.br/reforma-tributaria/artigo/rpa-ou-nota-fiscal/
- Assolari Contábil — Substituição do RPA pela NFS-e Nacional em 2026: https://assolari.com.br/atualidades/substituicao-do-rpa-pela-nfs-e-nacional-em-2026-o-que-voce-precisa-saber/
- ATC Zanardi — RPA deixa de ser válido em 2026: https://atczanardicontabilidade.com.br/rpa-deixa-de-ser-valido-em-2026-entenda-a-obrigatoriedade-da-nfs-e-para-autonomos/
- Serasa Experian — Como funciona o RPA: https://www.serasaexperian.com.br/conteudos/recibo-de-pagamento-para-autonomos/
- iure.digital — RPA: obrigações, riscos e tributos (vínculo empregatício risk): https://iure.digital/blog/recibo-de-pagamento-autonomo-rpa-obrigacoes-riscos-e-tributos/

_This document reflects publicly available guidance as researched in September 2026. Brazilian fiscal rules for NFS-e/RPA transition and reforma tributária are changing rapidly — re-validate before each build phase with a licensed contador and, for structuring/liability questions, a tax/labor lawyer._
