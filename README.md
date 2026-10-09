# FinResidence

[FinResidence](https://finresidence.fi/) estimates the residence-time part of common Finnish citizenship and permanent-residence applications. It is an independent educational project created by Boris, not a Migri service, legal advice or an application decision.

The static website runs a shared Go calculation engine through WebAssembly in the visitor's browser. Permit dates and trips are not sent to a server or to analytics. An optional draft is saved only when the visitor chooses **Save**, using the browser's local storage; **Clear** removes it. The production site uses cookie-free Cloudflare Web Analytics for aggregate site-use and performance statistics. Hosting providers still process ordinary website requests. Feedback links open public GitHub issues, so reports should use invented dates and exclude personal details.

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

**Citizenship-test information updated on 9 October 2026:** [Migri's new bulletin](https://migri.fi/en/-/up-to-date-information-on-amendments-to-citizenship-act-learning-material-for-citizenship-test-to-be-published-at-turn-of-the-year) describes an in-person, computer-based multiple-choice test in Finnish or Swedish, with a result that does not expire. The test must be passed before applying if used to meet the civic-knowledge requirement; a YKI language certificate does not replace it. Both educational alternatives must be completed in Finland: a matriculation examination in Finnish or Swedish, or a Finnish-/Swedish-language higher education degree. Statutory exemptions are assessed by Migri; citizenship declarations are not subject to this new requirement. The University of Helsinki prepares the learning material and questions; Migri plans to publish self-study material at the turn of 2026/2027. Migri plans 6–10 national test sessions per year, with 2027 venues in the Helsinki capital region, Tampere, Turku, Oulu, Kuopio, Vaasa and Rovaniemi. Dates and registration times are to be published by the turn of the year. The test will have a fee, but no amount is announced in this bulletin. Special arrangements and an oral option for people unable to read/write are described. This is a scoped information update, not a new full review of all residence rules and fees; the calculation engine and general review date are unchanged.

## Local development

Use Go 1.27.1 or a newer supported patch and Node.js 24. The module declares this minimum so Go's automatic toolchain selection can obtain the matching compiler when necessary. CI and production builds use the supported Go 1.27 release line and copy its matching WebAssembly runtime. Run commands from the repository root.

PowerShell:

```powershell
go test ./...
$env:GOOS = "js"
$env:GOARCH = "wasm"
go build -o docs/main.wasm ./cmd/wasm
Remove-Item Env:GOOS, Env:GOARCH
$taskGoRoot = go env GOROOT
Copy-Item "$taskGoRoot/lib/wasm/wasm_exec.js" docs/wasm_exec.js
npm run build:assets
go run ./cmd/server
```

Linux/macOS:

```sh
go test ./...
GOOS=js GOARCH=wasm go build -o docs/main.wasm ./cmd/wasm
cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" docs/wasm_exec.js
npm run build:assets
go run ./cmd/server
```

Open [the local site](http://127.0.0.1:8080). The development server also provides `GET /healthz` and an optional `POST /api/calculate` endpoint. Production GitHub Pages exposes only static files, and the website calculates through WASM.

Browser tests start their own development server:

```sh
npm ci --ignore-scripts
npm run test:unit
npm run test:review
npx --no-install playwright install chromium webkit
npm run test:e2e
```

Linux CI installs the browsers' system dependencies as well. To run only desktop Chromium locally, use `npm run test:e2e -- --project=chromium`. `npm run test:links` checks official/external links; `npm run test:site` checks the public HTTPS site and its essential assets.

`npm run test:production` exercises the live public calculator in Chromium, with invented permit/trip dates only. It needs Chromium installed but starts no development server. To validate the same smoke tests against a running local server before publication:

```powershell
$env:FINRESIDENCE_SMOKE_BASE_URL = "http://127.0.0.1:8080/"
try { npm run test:production } finally { Remove-Item Env:FINRESIDENCE_SMOKE_BASE_URL }
```

The default target is `https://finresidence.fi/`; only the canonical production origin or an explicit loopback server is accepted. HTTPS certificate validation remains enabled. Browser traces, screenshots and videos are disabled for this synthetic production check.

## Architecture and verification

```text
docs/index.html -> Go WASM adapter -> internal/calculator
 optional HTTP API ----------------> internal/calculator
```

The engine supplies both adapters with the same calendar calculations, warnings and auditable breakdown. Unit tests cover permit credit, interruptions, trip boundaries, duplicate days and route safeguards; HTTP integration tests cover the optional local API.

CI checks formatting, Go vet, race-enabled Go tests, WASM build and browser flows on pull requests and `main`. Playwright runs the suite in Chromium and iPhone-sized WebKit on Linux, covering calculation, validation, drafts, all ten locales and responsive layout. WebKit emulation supplements testing on a real iPhone; it is not a device certification. Failure screenshots, traces and an HTML report are retained for 14 days.

Count formatting uses locale-specific cardinal forms and preserves fractional B-permit credit. Independent Node fixtures cover all ten languages, singular/plural boundaries and half days; browser tests check the actual translated result and breakdown. Automated tests do not replace proofreading by native speakers.

Each build adds SHA-256 content versions to the translation script, matching Go runtime and WASM URLs. This prevents a newly loaded page from reusing an older browser-cached script under the same URL. Run `npm run build:assets` after changing any of those files; CI and deployment do this automatically after compiling WASM. A regression scenario explicitly serves stale unversioned asset URLs and requires the updated page to ignore them. These query versions are cache invalidation, not archived immutable releases: they do not keep old builds available indefinitely for an already-open page.

Dependencies are installed from the committed npm lock with `npm ci`. Dependabot reviews Go/npm/Actions weekly; CodeQL scans Go on pull requests, `main` and a weekly schedule. External-source checks are weekly/manual. The separate **Site health** workflow checks HTTPS, the page, JavaScript, valid WASM, icon, manifest, robots and sitemap daily, manually and after publication. It also runs a real Go/WASM calculation through the published UI: B half-credit, departure/return day handling, 90/91- and 365/366-day absence boundaries, validation, projections and translated mobile results in all ten languages. The smoke suite runs against the local build in CI before release as well.

Post-deployment checks ignore successful workflow runs whose deployment was skipped, check out the triggering release's tests and wait up to three minutes for its exact WASM VCS stamp. A working stale release is not accepted as proof of the new release. Production failure reports are retained for seven days. Health failure reports an outage independently of deployment, so initial DNS setup does not prevent publishing fixes.

**Rules review** validates manually maintained source-review dates on pull requests and `main`, and checks them daily. `docs/rules-review.json` records the quarterly cadence and explicit pre-2027 checkpoints: **15 December 2026** before entry into force, and **15 February 2027** before the application-date cut-off. When a review is due, the scheduled/manual workflow maintains one GitHub issue with official sources and a release checklist. Repeated runs do not create duplicate reminders; closing an issue alone does not record a completed review. Legal text, fees and review dates are never updated automatically. Complete the review using [the review procedure](docs/RULES_REVIEW.md), then update its metadata and all visible review dates together. An overdue reminder does not block a correction release; invalid or inconsistent metadata does fail validation.

## Website statistics and privacy

In the site's Cloudflare account, open **Observability → Analytics → Web analytics**, select **finresidence.fi**, and choose the period to inspect. This is website traffic, not the repository traffic shown by GitHub. Cloudflare reports page views, visits, countries, device/browser types, referrer hosts and loading performance. A visit is an entry from another website or a direct link, not an exact count of unique people. See the official [metrics definitions](https://developers.cloudflare.com/web-analytics/data-metrics/high-level-metrics/) and [available dimensions](https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/).

The manually installed beacon is used because this domain remains **DNS only**, with GitHub Pages hosting the site. No Cloudflare proxy, paid hosting, API credential or tag manager is needed. If setup must be restored, find the existing **finresidence.fi** entry under **Web analytics → Manage site** and select **Enable with JS Snippet installation**. Its public snippet identifies the statistics property, not an API credential. Use **Add a site** only if that entry no longer exists; keep only one beacon installation. Follow [Cloudflare's instructions for sites not proxied through Cloudflare](https://developers.cloudflare.com/web-analytics/get-started/).

The analytics loader runs only on the canonical HTTPS production origin. Local development, browser-test servers and GitHub Pages preview origins do not send analytics. The loader also skips an initial URL with a query string or fragment, to avoid sending potentially private URL content as page metadata; share the plain `https://finresidence.fi/` link. It does not read the permit/trip form, saved draft or calculation result, and there are no custom calculation events. Analytics availability must never determine whether the calculator works.

Browser tests validate the shipped loader, exact property token, privacy separation and blocked-script behaviour without sending synthetic visits to Cloudflare. They deliberately replace the vendor script with an inert response or a disclosed minimal page-metrics shim; they do not certify the vendor's implementation. When installing or changing the integration, separately verify the real script's collector response and the site's first page view in Cloudflare.

The beacon sends page-view and browser-performance metadata to Cloudflare. It uses no analytics cookies, does not read the local draft, and does not use browser storage to track visitors. Ordinary network requests still expose the source IP to the receiving service. Cloudflare states that its RUM service discards that IP at the nearest data center rather than storing it in core databases or logs. Do not describe the entire website as processing no personal data or promise that an IP is never received. See [Cloudflare's RUM collection and privacy documentation](https://developers.cloudflare.com/speed/observatory/rum-beacon/).

Statistics begin after installation; earlier visits cannot be recovered. Ad blockers, restrictive browsers or connection failures can leave visits uncounted. Cloudflare Web Analytics currently has no UTM reporting or custom-event support, so it does not measure how often someone clicks **Calculate**. These are directional site-use figures, not an audit of every visitor. See [Cloudflare's analytics FAQ](https://developers.cloudflare.com/web-analytics/faq/).

## Production domain and HTTPS

The intended primary address is `https://finresidence.fi/`. Domainhotelli remains the registrar; Cloudflare Free supplies authoritative DNS in **DNS only** mode; GitHub Pages hosts the static site and issues its HTTPS certificate. Domain registration still renews at the registrar. No paid web-hosting or redirect service is required for this arrangement.

Configure the domain in this order:

1. In the repository's [Settings → Pages](https://github.com/XeUby/Eligibility-Calculator-for-Finnish-Citizenship-and-Permanent-Residence/settings/pages), select **GitHub Actions** as the source and set the custom domain to `finresidence.fi`. Keep the matching `docs/CNAME` and site metadata in the repository. Verify domain ownership in the owner's GitHub account **Settings → Pages** with its account-specific TXT record. Keep that TXT record after verification: it protects the domain from being claimed by another GitHub account if the repository binding is accidentally removed.
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

The Cloudflare nameservers assigned to this zone on 5 October 2026 are `boyd.ns.cloudflare.com` and `cloe.ns.cloudflare.com`. The GitHub ownership TXT name is `_github-pages-challenge-XeUby.finresidence.fi`; obtain its value from the owner's GitHub Pages settings. These details are specific to this deployment, not a template for another account or domain.

Publishing is automatic after successful **CI** for the exact current `main` commit. The deploy workflow validates the commit through GitHub's API, skips stale results, checks out that SHA, builds WASM with its matching Go runtime and publishes `docs/`. A manual deploy uses the same successful-CI check; run CI first if that commit has no passing result. Routine code changes need only a tested commit and push; DNS is not changed for releases.

For a release regression, revert the affected change with a new commit on `main`, run the tests and push it. The revert must pass the same CI gate before publication. Do not force-push history, disable checks or change DNS to roll back application code. Check the **Deploy GitHub Pages** and **Site health** results after every release; a successful upload alone does not confirm working HTTPS or calculation assets.

## Contributions and feedback

Use [GitHub issues](https://github.com/XeUby/Eligibility-Calculator-for-Finnish-Citizenship-and-Permanent-Residence/issues) for bugs or suggestions. When changing legal information, include the current official source, effective/application dates and relevant boundary tests, then update all ten translations and the review record in the same change. Avoid collecting residence histories or presenting estimated dates as a guarantee of eligibility.
