# Reviewing rules and public information

FEE.fi is an educational estimator. It must never present itself as a Migri
service or as a legal decision. The visible review date is a promise to review
the material, not a guarantee that every visitor meets every immigration rule.

## When to review

Review at least once per quarter, and immediately after a relevant Migri,
Ministry of the Interior, Parliament or Finnish National Agency for Education
announcement. Review before changing any eligibility calculation, fee or
effective-date statement.

## Required official sources

1. [Migri: citizenship application for adults](https://migri.fi/en/citizenship-for-adults)
2. [Migri: calculate the period of residence](https://migri.fi/en/how-to-calculate-the-period-of-residence)
3. [Migri: permanent residence permits](https://migri.fi/en/permanent-residence-permits)
4. [Migri: 2026 permanent-residence amendments](https://migri.fi/en/amendments-to-aliens-act-regarding-permanent-residence-permits-2026)
5. [Migri: processing fees](https://migri.fi/en/processing-fees-and-payment-methods)
6. [Finnish National Agency for Education: YKI registration and fees](https://www.oph.fi/en/education-and-qualifications/registering-yki-test)

## Review checklist

- Confirm application-date cut-offs, residence periods, absence limits and
  which permit types count.
- Confirm every permanent-residence route and explicitly record which extra
  conditions the calculator cannot verify.
- Confirm fees and test information; remove any figure that is not published
  by an official source.
- Update the visible date in `docs/i18n.js`, links in `docs/index.html`, and
  the source list in `README.md`.
- Change the Go rule tests when and only when the underlying legal rule has
  changed. Include the official source URL in the pull request description.
- Update all ten language strings for every changed user-facing sentence.
- Run `go test ./...`, build `docs/main.wasm`, and run the browser test suite.
- Record a concise entry in the pull request or commit message describing what
  changed, the source checked, and the effective date.

## What requires legal review before modelling

Do not add a new rule merely because a user reports it. Seek a current primary
source before modelling special citizenship routes, exceptions, EU/free
movement cases, international protection, children, income/livelihood,
integrity, criminal waiting periods, permit grounds, or case-specific
derogations.
