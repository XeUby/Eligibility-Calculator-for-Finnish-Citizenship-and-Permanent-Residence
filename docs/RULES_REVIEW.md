# Reviewing rules and public information

FinResidence is an independent educational estimator. A completed residence-time estimate is not a Migri decision or a finding that all application conditions are met. The visible review date records a source review, not a guarantee about a visitor's case.

Last reviewed: **5 October 2026**.

## Review record: 5 October 2026

The review uses current detailed Migri application instructions when an older amendment summary is less precise. Information pages and the calculator must distinguish enacted future changes from proposals.

- Citizenship civic knowledge: Parliament has approved the change taking effect on **1 January 2027**; it applies to applications submitted from **1 March 2027**. The usual citizenship test applies to ages 18–64, with official alternatives and possible exemptions. The calculator only warns about this requirement. Do not invent a test fee, booking process or study materials before they are officially published. [Migri announcement](https://migri.fi/en/-/finland-to-introduce-citizenship-test-as-changes-to-citizenship-act-take-effect-on-1-january-2027)
- High-income PR route: the threshold is **at least €40,000**, measured from the most recently completed tax assessment. Add taxable earned and capital income before tax, then subtract taxable social benefits. It is not a current salary estimate or a requirement to earn strictly more than €40,000. The visitor confirms these facts; the calculator does not collect tax data. [Detailed PR application instructions](https://migri.fi/en/application-for-a-permanent-residence-permit)
- Finnish-degree PR route: eligible qualifications are a Finnish university bachelor's degree, a master's degree from a university or university of applied sciences, or a licentiate/doctoral degree. A university-of-applied-sciences bachelor's degree is excluded. Developing Finnish/Swedish skills can be shown through **A2** or **15 higher-education credits** in those languages, subject to Migri's accepted evidence. The route has no residence-time minimum but still has permit, residence and other conditions. [Current PR path requirements](https://migri.fi/en/permanent-residence-permit)
- Study-based A permits: previous residence under such a permit may count for permanent residence only after completion of the degree on which that permit was based. Studies alone cannot be the current grounds for granting a permanent permit. The tool cannot establish degree completion or permit grounds from permit letters and dates. [PR residence calculation](https://migri.fi/en/period-of-residence-requirement), [accepted permit grounds](https://migri.fi/en/permanent-residence-permit)
- PR trips: Migri's continuity guidance requires at least half of the relevant time to have been spent in Finland; reasons for absence and exceptions can affect the assessment. The calculator conservatively checks recorded physical residence in the required calendar window for four/six-year paths and withholds a reliable date if excessive absence needs review. It does not subtract citizenship's 365/90-day allowance from PR. Applications submitted before **8 January 2026** are outside the selected PR paths and must not receive a positive result under the new rules. [PR periods, trips and cut-off](https://migri.fi/en/period-of-residence-requirement)
- Citizenship calculation safeguards: an initial B period is credited at half before the first A/P period; where that credit is used, at least one uninterrupted A/P year is required by the decision. The estimator conservatively requires it by the selected calculation date. Departure and return days stay in residence time; overlapping absences count once. The preceding-year allowance must be reassessed at a projected application date. A continuous stay abroad of more than five years interrupts residence under §16 and requires review instead of a reliable projected date. The strict statutory threshold takes precedence over shorthand in guidance. [Citizenship residence calculation](https://migri.fi/en/how-to-calculate-the-period-of-residence), [Nationality Act §§15–16](https://www.finlex.fi/en/legislation/2003/359)
- Fees must be checked against the current adult application pages and OPH YKI information. Preserve the separate citizenship and permanent-permit electronic/paper fees and YKI level fees; do not infer upcoming fees. [Migri processing fees](https://migri.fi/en/processing-fees-and-payment-methods), [OPH YKI registration and fees](https://www.oph.fi/en/education-and-qualifications/registering-yki-test)

## Required primary sources

1. [Migri: citizenship application for adults](https://migri.fi/en/citizenship-for-adults)
2. [Migri: calculate the citizenship period of residence](https://migri.fi/en/how-to-calculate-the-period-of-residence)
3. [Migri: permanent residence paths and permit grounds](https://migri.fi/en/permanent-residence-permit)
4. [Migri: detailed permanent residence application requirements](https://migri.fi/en/application-for-a-permanent-residence-permit)
5. [Migri: PR periods, studies and trips](https://migri.fi/en/period-of-residence-requirement)
6. [Migri: 2026 permanent-residence amendments](https://migri.fi/en/amendments-to-aliens-act-regarding-permanent-residence-permits-2026)
7. [Migri: processing fees](https://migri.fi/en/processing-fees-and-payment-methods)
8. [OPH: YKI registration and fees](https://www.oph.fi/en/education-and-qualifications/registering-yki-test)
9. [Migri: citizenship civic-knowledge change and application-date transition](https://migri.fi/en/-/finland-to-introduce-citizenship-test-as-changes-to-citizenship-act-take-effect-on-1-january-2027)

## When and how to review

Review at least quarterly and immediately after a relevant announcement by Migri, the Ministry of the Interior, Parliament or OPH. Review again before releasing a rule, fee or effective-date change. Successful link checks only show that a URL responds; they do not establish that its legal content is unchanged.

### Automated maintenance reminder, not an automatic legal review

[`rules-review.json`](rules-review.json) records the manually checked date, a three-calendar-month review interval and the next deadline. The current first deadline is **15 December 2026**, before the known **1 January 2027** entry into force. A separate **15 February 2027** checkpoint requires review before the **1 March 2027** application cut-off. These reminder dates are maintenance choices, not new legal effective dates. The quarterly deadline from the current review is **5 January 2027**.

The **Rules review** workflow validates these dates on pull requests and `main`. Its daily/manual run on `main` uses only repository-content read and issue-write permissions to maintain one bot-owned issue with an exact identifier. It reuses that issue, preserves notes and same-cycle checklist progress, and avoids repeated updates while the due state is unchanged. Due reminders do not fail application builds; malformed or inconsistent dates do. A passing workflow never changes legislation, prices or a source-review date.

After an actual source review, manually update `lastReviewed`, the visible dates and this record together. Compute `nextReview` as the earliest of the three-calendar-month deadline and any unacknowledged checkpoint. Set a checkpoint's `reviewedOn` only when its specific sources and transition details were checked; an early review can explicitly acknowledge a checkpoint. Keep acknowledgement dates no later than `lastReviewed`. Closing the GitHub issue alone is not completion: it reopens if the metadata still records a due review. Once recorded deadlines are no longer due, the next daily/manual run closes the managed reminder. Date comparisons use strict UTC calendar dates, avoiding daylight-saving-time arithmetic.

Run `npm run test:unit` and `npm run test:review`; `node scripts/check-review.mjs --as-of 2026-12-15` can preview a deadline without creating an issue. Only `--issue` performs GitHub issue writes and requires the workflow's scoped token. The checker also guards against drift between the metadata, README, review record, English page fallback and English translation review dates. All ten translated dates still require human review.

- Confirm legal entry-into-force dates separately from application-date cut-offs, plus residence periods, permit types, trip treatment and exceptions.
- Review each path's language, work, income, degree and ongoing permit-ground conditions. Record which are shown as guidance, explicitly confirmed by the visitor, calculated, or outside scope.
- Use current detailed application guidance if a press release or older summary conflicts; record the discrepancy and primary source. Seek specialist review if it remains unresolved.
- Confirm published fees/test details. Remove unsupported amounts and label enacted future changes accurately.
- Update the visible review date and translations in `docs/i18n.js`, source links in `docs/index.html`, this record and `README.md` together.
- Add or adjust meaningful Go boundary tests for legal changes and calculation corrections. Include a source URL and the effective/application date in the commit or pull request.
- Update all ten languages for every changed user-facing sentence, including result warnings and route conditions.
- Run Go tests, build the WASM application with the matching `wasm_exec.js`, and run the Chromium/iPhone WebKit suite. Check source links separately. After release, run the independent public-site health check.
- Record what was checked, what changed, known limitations and the review date. Do not advance a review date merely because an automated workflow succeeded.

## Facts outside automatic eligibility assessment

New modelling of special citizenship routes, children, EU/free movement, P-EU, international protection, identity, livelihood, integrity, criminal waiting periods, degree recognition, work-history exceptions, permit grounds or case-specific derogations requires current primary sources and a deliberate scope review. Until those facts are verified, show clear limits or require Migri's assessment rather than converting missing facts into a positive legal outcome.
