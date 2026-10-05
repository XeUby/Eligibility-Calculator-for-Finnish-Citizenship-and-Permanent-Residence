# FinResidence

[FinResidence](https://finresidence.fi/) estimates the residence-time part of common Finnish citizenship and permanent-residence applications. It is an independent educational project created by Boris, not a Migri service, legal advice or an application decision.

The static website runs a shared Go calculation engine through WebAssembly in the visitor's browser. Permit dates and trips are not sent to a server. An optional draft is saved only when the visitor chooses **Save**, using the browser's local storage; **Clear** removes it. Hosting providers still process ordinary website requests. Feedback links open public GitHub issues, so reports should use invented dates and exclude personal details.

The interface supports English, Finnish, Swedish, Russian, Ukrainian, Nepali, Arabic, Somali, Estonian and Hindi, including right-to-left Arabic and phone layouts. Official source pages remain in the language published by the authority.

## Calculation scope

For citizenship applications under the rules applicable from 1 October 2024, the common routes are eight calendar years, or five where the statutory language qualification applies. Initial B-permit residence contributes half before the first A/P period. The estimate conservatively requires one uninterrupted A/P year by the selected date when B credit is used; the official condition concerns the decision date. Later B periods do not advance the projected date.

Citizenship trips exclude departure and return days and count overlapping days once. The engine applies the 365-day overall and 90-day preceding-year allowances, recalculates the preceding-year window at the projected date, and withholds a reliable date for a recorded absence of more than five continuous years (Nationality Act §16).

For permanent-residence applications from 8 January 2026, the site offers the six-year route, three selected four-year routes, and the Finnish-degree route with no residence-time minimum. It uses uninterrupted A/P permit history and requires the visitor to confirm the additional route conditions. For four/six-year paths, excessive recorded time abroad triggers manual review rather than a positive estimate: the simplified safeguard checks physical residence against half of the required calendar window. It cannot assess reasons for absence or statutory exceptions. Earlier application rules are outside this calculator.

The route confirmation covers facts the calculator cannot establish, including qualifying degrees, language/work history, income and continuing grounds for an A permit. Study-based A residence counts towards permanent residence only after the degree underlying that permit is completed. The Finnish-degree route excludes a university-of-applied-sciences bachelor's degree and requires developing Finnish/Swedish skills. This is a residence-time aid; it does not verify identity, livelihood, integrity, permit grounds, special routes, EU/P-EU cases or Migri's assessment of interruptions and exceptions.

## Official information

Last reviewed: **5 October 2026**. Follow [the review record and checklist](docs/RULES_REVIEW.md) for the checked rules, fee sources and limitations.

- [Migri: citizenship for adults](https://migri.fi/en/citizenship-for-adults)
- [Migri: calculating citizenship residence](https://migri.fi/en/how-to-calculate-the-period-of-residence)
- [Migri: permanent residence paths](https://migri.fi/en/permanent-residence-permit)
- [Migri: permanent residence application and detailed conditions](https://migri.fi/en/application-for-a-permanent-residence-permit)
- [Migri: permanent residence, studies and trips](https://migri.fi/en/period-of-residence-requirement)
- [Migri: current processing fees](https://migri.fi/en/processing-fees-and-payment-methods)
- [Finnish National Agency for Education: YKI registration and fees](https://www.oph.fi/en/education-and-qualifications/registering-yki-test)

Parliament has approved the citizenship civic-knowledge change: the Act changes enter into force on **1 January 2027**, and the new requirement applies to applications submitted from **1 March 2027**. Applicants aged 18–64 can normally meet it through the citizenship test; official alternatives and exemptions also exist. The site shows an informational warning for relevant estimated application dates and does not assess the test requirement itself. See [Migri's announcement](https://migri.fi/en/-/finland-to-introduce-citizenship-test-as-changes-to-citizenship-act-take-effect-on-1-january-2027).

## Local development

Use Go 1.25 or newer and Node.js 24. Run commands from the repository root.

PowerShell:

```powershell
go test ./...
$env:GOOS = "js"
$env:GOARCH = "wasm"
go build -o docs/main.wasm ./cmd/wasm
Remove-Item Env:GOOS, Env:GOARCH
$taskGoRoot = go env GOROOT
Copy-Item "$taskGoRoot/lib/wasm/wasm_exec.js" docs/wasm_exec.js
go run ./cmd/server
```

Linux/macOS:

```sh
go test ./...
GOOS=js GOARCH=wasm go build -o docs/main.wasm ./cmd/wasm
cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" docs/wasm_exec.js
go run ./cmd/server
```

Open [the local site](http://127.0.0.1:8080). The development server also provides `GET /healthz` and an optional `POST /api/calculate` endpoint. Production GitHub Pages exposes only static files, and the website calculates through WASM.

Browser tests start their own development server:

```sh
npm ci --ignore-scripts
npx --no-install playwright install chromium webkit
npm run test:e2e
```

Linux CI installs the browsers' system dependencies as well. To run only desktop Chromium locally, use `npm run test:e2e -- --project=chromium`. `npm run test:links` checks official/external links; `npm run test:site` checks the public HTTPS site and its essential assets.

## Architecture and verification

```text
docs/index.html -> Go WASM adapter -> internal/calculator
 optional HTTP API ----------------> internal/calculator
```

The engine supplies both adapters with the same calendar calculations, warnings and auditable breakdown. Unit tests cover permit credit, interruptions, trip boundaries, duplicate days and route safeguards; HTTP integration tests cover the optional local API.

CI checks formatting, Go vet, race-enabled Go tests, WASM build and browser flows on pull requests and `main`. Playwright runs the suite in Chromium and iPhone-sized WebKit on Linux, covering calculation, validation, drafts, all ten locales and responsive layout. WebKit emulation supplements testing on a real iPhone; it is not a device certification. Failure screenshots, traces and an HTML report are retained for 14 days.

Dependencies are installed from the committed npm lock with `npm ci`. Dependabot reviews Go/npm/Actions weekly; CodeQL scans Go on pull requests, `main` and a weekly schedule. External-source checks are weekly/manual. The separate **Site health** workflow checks HTTPS, the page, JavaScript, valid WASM, icon, manifest, robots and sitemap daily, manually and after publication. Health failure reports an outage independently of deployment, so initial DNS setup does not prevent publishing fixes.

## Production domain and HTTPS

The intended primary address is `https://finresidence.fi/`. Domainhotelli remains the registrar; Cloudflare Free supplies authoritative DNS in **DNS only** mode; GitHub Pages hosts the static site and issues its HTTPS certificate. Domain registration still renews at the registrar. No paid web-hosting or redirect service is required for this arrangement.

Configure the domain in this order:

1. In the repository's [Settings → Pages](https://github.com/XeUby/Eligibility-Calculator-for-Finnish-Citizenship-and-Permanent-Residence/settings/pages), select **GitHub Actions** as the source and set the custom domain to `finresidence.fi`. Keep the matching `docs/CNAME` and site metadata in the repository. Verify domain ownership in GitHub with its account-specific TXT record when requested.
2. Add `finresidence.fi` to Cloudflare on the **Free** plan and create the records below with **DNS only** (grey cloud) and TTL **Auto**. Preserve any unrelated mail/verification records; replace conflicting parking records for the apex and `www`.
3. If registrar DNSSEC is active, turn it off before migration. In Domainhotelli **Nameservers**, replace the existing nameservers with the two exact names assigned to this zone by Cloudflare. These are account/zone-specific; do not copy nameserver names from another domain or put GitHub's IPs into the nameserver fields.
4. Wait until Cloudflare shows the zone as **Active** and GitHub's DNS check passes. Then enable **Enforce HTTPS** in GitHub Pages. Certificate issuance and DNS propagation can take time; the registrar's SSL indicator is not the certificate control for this website.
5. Check the apex, `www` redirect, HTTPS and **Site health** workflow. If DNSSEC is re-enabled, use Cloudflare's new DS information at the registrar rather than an old provider's DS record.

| Type | Name | Value | Mode |
| --- | --- | --- | --- |
| A | `@` | `185.199.108.153` | DNS only |
| A | `@` | `185.199.109.153` | DNS only |
| A | `@` | `185.199.110.153` | DNS only |
| A | `@` | `185.199.111.153` | DNS only |
| AAAA | `@` | `2606:50c0:8000::153` | DNS only |
| AAAA | `@` | `2606:50c0:8001::153` | DNS only |
| AAAA | `@` | `2606:50c0:8002::153` | DNS only |
| AAAA | `@` | `2606:50c0:8003::153` | DNS only |
| CNAME | `www` | `xeuby.github.io` | DNS only |

Do not add a wildcard record. In DNS-only mode traffic goes directly to GitHub Pages, so Cloudflare's proxy SSL settings do not control the website certificate. See [GitHub's custom-domain instructions](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site) and [Cloudflare's nameserver migration instructions](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/).

Publishing is automatic after successful **CI** for the exact current `main` commit. The deploy workflow validates the commit through GitHub's API, skips stale results, checks out that SHA, builds WASM with its matching Go runtime and publishes `docs/`. A manual deploy uses the same successful-CI check; run CI first if that commit has no passing result. Routine code changes need only a tested commit and push; DNS is not changed for releases.

## Contributions and feedback

Use [GitHub issues](https://github.com/XeUby/Eligibility-Calculator-for-Finnish-Citizenship-and-Permanent-Residence/issues) for bugs or suggestions. When changing legal information, include the current official source, effective/application dates and relevant boundary tests, then update all ten translations and the review record in the same change. Avoid collecting residence histories or presenting estimated dates as a guarantee of eligibility.
