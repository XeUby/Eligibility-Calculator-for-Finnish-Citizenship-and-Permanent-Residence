# Finland eligibility estimator

A private, browser-only estimator for the **residence-time** part of common Finnish citizenship and permanent-residence (PR) routes. It is an educational aid, not legal advice and not a Migri decision.

The published site is built as Go/WebAssembly and runs entirely in the visitor’s browser. Residence history and absence dates are not submitted or logged. A visitor can optionally save a draft in their own browser and remove it with one click.

The interface is available in English, Finnish, Swedish, Russian, Ukrainian, Nepali, Arabic, Somali, Estonian and Hindi. Official Migri source links remain in their published language.

## What it estimates

- Citizenship applications submitted from 1 October 2024: 8 years on the standard route, or 5 years where the statutory language route applies.
- B-permit time: half of a B period before the first A/P period is credited for the common citizenship calculation.
- Citizenship absence guidance: no more than 365 days total and 90 days in the preceding year; departure and return dates count as residence days. Overlapping or duplicate trips are normalised and counted once.
- PR applications submitted from 8 January 2026: the six-year route, selected four-year paths, and the Finnish-degree route with no residence-time requirement. Each has additional conditions that the visitor must verify with Migri.

The tool does **not** determine identity, income/livelihood, integrity, the validity or grounds of a permit, special citizenship routes, EU/free-movement cases, or Migri’s case-specific assessment. It deliberately reports warnings instead of converting missing information into a positive legal result.

Official sources, last reviewed 26 August 2026:

- [Migri: calculate the citizenship residence period](https://migri.fi/en/how-to-calculate-the-period-of-residence)
- [Migri: citizenship application for adults](https://migri.fi/en/citizenship-for-adults)
- [Migri: permanent residence permits](https://migri.fi/en/permanent-residence-permits)
- [Migri: 2026 permanent-residence amendments](https://migri.fi/en/amendments-to-aliens-act-regarding-permanent-residence-permits-2026)
- [Migri: 2026 processing fees](https://migri.fi/en/processing-fees-and-payment-methods)
- [Migri: citizenship test for applications from 1 March 2027](https://migri.fi/en/-/finland-to-introduce-citizenship-test-as-changes-to-citizenship-act-take-effect-on-1-january-2027)

## Confirmed upcoming change

Parliament has approved the next Citizenship Act change. For applications submitted on or after **1 March 2027**, applicants aged 18–64 will need to meet a civic-knowledge requirement. Migri says this is normally met with the new citizenship test; specified alternatives and exemptions are available. The calculator warns when its projected citizenship date falls on or after that application date. This is a confirmed future rule, not merely a government proposal.

## Local development

Prerequisite: Go 1.25 or newer.

    go test ./...
    $env:GOOS = "js"; $env:GOARCH = "wasm"
    go build -o docs/main.wasm ./cmd/wasm
    Remove-Item Env:GOOS, Env:GOARCH
    go run ./cmd/server

Open http://127.0.0.1:8080. The local server provides the static site, GET /healthz, and an optional POST /api/calculate endpoint that uses the same calculation engine. GitHub Pages serves only the static site.

For browser tests, install Node 22 and run:

    npm install
    npx playwright install chromium
    npm run test:e2e

## Architecture

    docs/index.html  -> Go WASM adapter -> internal/calculator
     optional HTTP API -----------------> internal/calculator

The calculator package is the sole place where date and route logic lives. Both delivery layers use it, preventing API/WASM rule drift. The browser renders an auditable breakdown of B-permit credit, A/P credit, trip days and any absence deduction.

## Quality gates

- Unit tests cover B-to-A credit, permit gaps, absence-day boundaries, overlapping trips and PR A/P-only rules.
- HTTP integration tests cover health, valid calculations and strict JSON validation.
- Playwright e2e tests cover calculations, local-only draft storage, client-side validation, all ten translations, source/feedback links and phone-sized layouts.
- GitHub Actions runs formatting, vet, race-enabled Go tests, WASM build and Chromium tests for every pull request and push to main.
- CodeQL scans Go code on pull requests, pushes and a weekly schedule. Dependabot opens weekly update pull requests for Go modules, npm and GitHub Actions.
- A separate weekly link check verifies the published external links on the site and in the rules-review checklist.

## Production hosting, HTTPS and domain

The repository includes a GitHub Pages deployment workflow. In **Settings → Pages**, set the source to **GitHub Actions** once. Every successful push to main then deploys the exact docs artifact; GitHub Pages provides HTTPS on the default https://account.github.io/repository/ URL.

For a custom domain, use a short neutral domain such as finland-eligibility.example:

1. Buy the domain in Boris’s account and add it in **Settings → Pages → Custom domain**.
2. At the registrar, point www to account.github.io with a CNAME; configure the apex with GitHub’s current A/AAAA records or an ALIAS/ANAME record.
3. Wait for GitHub verification, then enable **Enforce HTTPS**.
4. Only after verification, add a one-line docs/CNAME containing the chosen domain and commit it.

No placeholder CNAME is committed: that would make the public deployment claim a domain the project does not control.

## Keeping the rules current

Follow [the rules-review checklist](docs/RULES_REVIEW.md) before releasing any rule, fee or effective-date change. It requires primary official sources, matching Go tests, all ten translations and the full CI suite.

## Contributing

When legislation changes, update the cited official source and the calculator’s rule tests in the same pull request. Do not publish legal guarantees or collect applicants’ residence histories.
