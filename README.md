# Finland eligibility estimator

A private, browser-only estimator for the **residence-time** part of common Finnish citizenship and permanent-residence (PR) routes. It is an educational aid, not legal advice and not a Migri decision.

The published site is built as Go/WebAssembly and runs entirely in the visitor’s browser. Residence history and absence dates are not submitted, logged or stored.

## What it estimates

- Citizenship applications submitted from 1 October 2024: 8 years on the standard route, or 5 years where the statutory language route applies.
- B-permit time: half of a B period before the first A/P period is credited for the common citizenship calculation.
- Citizenship absence guidance: no more than 365 days total and 90 days in the preceding year; departure and return dates count as residence days.
- PR applications submitted from 8 January 2026: a six-year route, plus selected four-year paths with their extra conditions.

The tool does **not** determine identity, income/livelihood, integrity, the validity or grounds of a permit, special citizenship routes, EU/free-movement cases, or Migri’s case-specific assessment. It deliberately reports warnings instead of converting missing information into a positive legal result.

Official sources, last reviewed 26 August 2026:

- [Migri: calculate the citizenship residence period](https://migri.fi/en/how-to-calculate-the-period-of-residence)
- [Migri: citizenship application for adults](https://migri.fi/en/citizenship-for-adults)
- [Migri: permanent residence permits](https://migri.fi/en/permanent-residence-permit)
- [Migri: 2026 processing fees](https://migri.fi/en/processing-fees-and-payment-methods)

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

The calculator package is the sole place where date and route logic lives. Both delivery layers use it, preventing the former API/WASM rule drift.

## Quality gates

- Unit tests cover B-to-A credit, permit gaps, absence-day boundaries and PR A/P-only rules.
- HTTP integration tests cover health, valid calculations and strict JSON validation.
- Playwright e2e tests cover a successful browser calculation and client-side date validation.
- GitHub Actions runs formatting, vet, race-enabled Go tests, WASM build and Chromium tests for every pull request and push to main.

## Production hosting, HTTPS and domain

The repository includes a GitHub Pages deployment workflow. In **Settings → Pages**, set the source to **GitHub Actions** once. Every successful push to main then deploys the exact docs artifact; GitHub Pages provides HTTPS on the default https://account.github.io/repository/ URL.

For a custom domain, use a short neutral domain such as finland-eligibility.example:

1. Buy the domain in Boris’s account and add it in **Settings → Pages → Custom domain**.
2. At the registrar, point www to account.github.io with a CNAME; configure the apex with GitHub’s current A/AAAA records or an ALIAS/ANAME record.
3. Wait for GitHub verification, then enable **Enforce HTTPS**.
4. Only after verification, add a one-line docs/CNAME containing the chosen domain and commit it.

No placeholder CNAME is committed: that would make the public deployment claim a domain the project does not control.

## Contributing

When legislation changes, update the cited official source and the calculator’s rule tests in the same pull request. Do not publish legal guarantees or collect applicants’ residence histories.
