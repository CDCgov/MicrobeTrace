# MicrobeTrace PrimeNG 22 Decision Assessment

**Date:** July 31, 2026
**Audience:** MicrobeTrace program, engineering, procurement, and open-source stakeholders
**Decision:** License PrimeNG 22, remain temporarily on PrimeNG 21, or replace PrimeNG for the Angular 22 upgrade

## Executive summary

- **PrimeNG 22 is technically compatible with Angular 22, but it is proprietary.** PrimeTek's current terms require a commercial license for CDC and expressly provide no open-source grant program. PrimeTek also confirmed directly that it will not provide an open-source grant for MicrobeTrace.
- **Buying PrimeUI is operationally workable for users, but changes the development model.** Licensed developers may deploy finished applications to unlimited end users with no runtime fee, and CI systems do not need seats. User-only partners and bioinformatics integrations are therefore unlikely to be directly affected. Developers who build, modify, or maintain the PrimeUI-based application do need licensed access.
- **The complete Angular 22 application would be mixed-source, not independently open-source.** CDC-authored code can remain Apache 2.0, but an outside party could not freely clone, build, modify, and redistribute the complete PrimeNG 22-based application under Apache terms alone.
- **AI changes the replacement economics.** NG-ZORRO remains the best single-suite open-source replacement. With GPT-5.6 Sol working against the repository and browser/test suite, the likely migration is **16-32 agent-active hours over 1-3 calendar days**, plus **2-6 hours of human review**, rather than a traditional multi-week estimate.

## Recommendation

Run two tracks now:

1. **Begin the PrimeUI quote and clarification process** so it remains available if the Angular 22 delivery date is urgent. Before purchase, get the licensed developer count, procurement timing, and written treatment of public builds, forks, and external contributors.
2. **Give GPT-5.6 Sol the full NG-ZORRO migration objective with a 2-4 hour hard-component checkpoint.** The checkpoint should cover the main table view, one full settings dialog, TreeSelect, reorder behavior, and targeted browser/Cypress verification. If that slice passes, continue through the complete replacement.

The preferred long-term outcome is the open-source replacement. If schedule pressure requires PrimeNG 22 first, use it as an explicitly documented **mixed-source bridge** with a reassessment or exit date. The important decision is not whether CDC may buy PrimeUI; it is whether the near-term continuity benefit outweighs recurring procurement, contributor, and upgrade friction.

## What the PrimeUI commercial option provides

Current published terms state:

- PrimeNG 22 and later are distributed under PrimeUI and are no longer open-source; PrimeNG 21 and earlier remain MIT licensed.
- Government and public-sector organizations are ineligible for the Community License.
- There is no separate open-source licensing program. PrimeTek repeated this in its email response to the MicrobeTrace team.
- The launch price is **$599 per active developer through December 31, 2026**, with one year of updates. PrimeTek lists **$799 per developer beginning in 2027** and **$399 per developer per year** to extend update access.
- The per-developer license is perpetual for versions released during the active update period. Renewal is optional unless the team needs newer releases and support.
- A seat is required for each person who writes, modifies, or maintains code using PrimeUI. Seats can be reassigned, but cannot cover concurrent developers.
- Finished applications may be distributed to unlimited end users with no royalties, runtime fees, or per-deployment charges. CI/CD and build servers do not need seats.

Pure code-review comments are not expressly classified in the published summary. External contributors who submit changes to PrimeUI-using code are much more clearly within the licensed-developer definition. Written clarification is appropriate before representing the public contribution workflow as unaffected.

## Who would actually be affected

| Group or workflow | Likely impact with PrimeNG 22 |
| --- | --- |
| Public-health users and deployed application users | Low. No end-user seats or runtime fees under the published commercial terms. |
| Bioinformatics platform integrations | Low if they consume the finished application, files, or APIs and do not develop against PrimeUI. |
| CDC developers and contractors modifying the UI | Direct. Each concurrent developer needs licensed coverage. |
| STLT partners who only use MicrobeTrace | Low. Their use of a finished deployment is not the licensing trigger. |
| STLT partners or community members who clone, build, fork, or contribute | Material. The complete application is not freely buildable and PrimeUI development rights are separately required. |
| Public CI/CD and release automation | Technically supported without machine seats, but public key/package/build handling should be confirmed in writing. |
| Open-source classification | Material. CDC code can remain Apache 2.0, but the complete dependency stack becomes mixed-source. |

This distinction addresses the team's central question: normal user-side partnerships probably continue without practical disruption, while reuse and contribution as a complete open-source development project become more complicated.

## Repository impact

The current application has substantial PrimeNG coupling, but much of it is mechanically migratable:

- `202` active top-level PrimeNG component tags across `16` templates.
- `16` TypeScript files import PrimeNG or its theme package.
- `13` application style files depend on `.p-*` implementation classes.
- Approximately `573` PrimeNG DOM/class references occur across `96` maintained Cypress/support files.
- Eight tables carry the highest behavioral risk: filtering, selection, paging, virtual scrolling, expansion, export, reorder, and direct PrimeNG table API use.
- Angular Material and Tabulator are already dependencies, which lowers the setup cost of a hybrid fallback.

The raw counts look large in a traditional estimate, but the repeated templates, selectors, imports, and styling patterns are well suited to compile-driven and search-driven agent migration. The real uncertainty is behavioral validation in the complex tables and overlay/focus flows.

## Option comparison

The estimates below are for one GPT-5.6 Sol coding agent with repository, dependency-install, local-browser, Playwright, and Cypress access. They exclude procurement and the Angular 22 framework upgrade itself and should be treated as **plus or minus 50%** until the hard slice is tested.

| Option | Concise pros | Concise cons | Sol effort | Open-source fit |
| --- | --- | --- | ---: | --- |
| **PrimeNG 22 commercial** | Lowest code churn; preserves current UX/tests; commercial support; fastest technical path | Proprietary dependency; seat/procurement/renewal friction; public contribution constraints; future terms risk | **2-6 hours**, plus procurement | **Mixed-source** |
| **NG-ZORRO 22** | MIT; Angular 22 aligned; closest single-suite table, TreeSelect, modal, select, collapse, and transfer coverage | Different DOM and Ant Design theme; test/style migration; community governance | **16-32 hours / 1-3 days** | **Strong** |
| **Angular Material/CDK + Tabulator or AG Grid Community** | MIT stack; Angular-team foundation; Material and Tabulator already present; strong grid options | Multiple libraries; custom TreeSelect/order-list/upload behavior; more integration code | **24-48 hours / 2-5 days** | **Strong** |
| **Spartan + TanStack Table** | MIT; modern Angular patterns; accessible headless primitives; maximum style ownership | Tailwind/style architecture change; table is a recipe; no direct TreeSelect/transfer equivalent | **32-64 hours / 3-7 days** | **Strong** |
| **Angular 21 + PrimeNG 21 hold** | No license or immediate UI refactor; remains fully MIT-compatible | Delays Angular 22; accumulates framework/security/maintenance debt; not a durable path | **0-2 hours now** | **Strong but time-limited** |
| **OpenNG/Optimus fork watchlist** | MIT fork of last open PrimeNG; potentially lowest churn; migration tooling | Angular 22 version is still roadmap work; young governance; large inherited issue backlog | **8-20 hours once v22 is stable** | **Strong, not ready** |

## Why NG-ZORRO remains the first alternative

NG-ZORRO 22 is MIT licensed, supports Angular 22, and provides the broadest direct coverage of the PrimeNG features MicrobeTrace actively uses. Its table and TreeSelect reduce the amount of application-owned behavior compared with Material/CDK or Spartan.

Spartan is a credible design-system choice, especially because CDC specifically raised it as a procurement-safe fallback. It is not the shortest migration here: its data table is built with TanStack Table and it lacks direct equivalents for several higher-risk controls. It becomes more attractive if the team also wants a Tailwind-based visual redesign and is willing to own more component code.

Material/CDK plus the already-present Tabulator dependency is the strongest consolidation fallback. AG Grid Community can also be evaluated if Tabulator cannot reproduce the critical table behaviors without enterprise-only features. This path has excellent long-term governance but more custom control integration than NG-ZORRO.

## AI-assisted execution plan

1. Replace PrimeNG-only data interfaces with application-owned types and add stable `data-testid` hooks/shared Cypress selectors.
2. Migrate the hard checkpoint first: Table view, a settings dialog, TreeSelect, and reorder behavior.
3. If the checkpoint passes, migrate repeated selects, dialogs, accordions, and simple controls using compile-driven batches.
4. Migrate remaining tables one behavioral group at a time, then remove PrimeNG styles, theme packages, PrimeIcons, and PrimeNG.
5. Run Playwright exploration, targeted Cypress after each hard slice, then the maintained Chrome journey suites, accessibility/focus checks, visual checks, and performance baselines.

Expected planning range:

- **Best case:** 6-12 hours for a compiling, broadly migrated branch.
- **Likely case:** 16-32 agent-active hours over 1-3 calendar days for a tested candidate.
- **High-friction case:** 3-5 days if table semantics, overlay behavior, flaky tests, or visual acceptance reveal substantial custom work.
- **Human involvement:** 2-6 hours for approvals, product/visual judgment, legal/procurement decisions, and final diff review.

## Decisions and clarifications still needed

1. What is the required date for the Angular 22 release, and is a 1-3 day migration attempt compatible with it?
2. How many CDC employees and contractors concurrently modify PrimeNG/PrimeUI code?
3. Will the program accept a mixed-source description and a public repository that is not independently buildable under Apache terms alone?
4. Will PrimeTek confirm treatment of public GitHub imports/configuration, forks, external pull requests, public CI builds, offline distribution, and license-key handling?
5. If commercial licensing is chosen, what reassessment date or exit trigger prevents an indefinite dependency on recurring procurement?

## Caveats

This is an engineering and program analysis, not legal advice. Final classification, redistribution, procurement, and license interpretation should be confirmed through CDC's appropriate legal/open-source and acquisition channels. Partner impact is inferred from PrimeTek's published distinction between finished-application users and developers; specific partner development arrangements may change that result.

## Sources

- [PrimeUI licensing announcement](https://primeui.dev/nextchapter)
- [PrimeUI Commercial License](https://primeui.dev/licenses/commercial)
- [PrimeUI Community License](https://primeui.dev/licenses/community)
- [PrimeUI pricing](https://primeui.dev/pricing)
- PrimeTek email to the MicrobeTrace team, July 2026: no Open Source Grant program; use PrimeNG 21 or another library/fork.
- CDC MicrobeTrace licensing and program email discussion provided for this assessment, July 2026.
- [NG-ZORRO Angular 22 and MIT support](https://ng.ant.design/docs/introduce/en)
- [Spartan Angular support](https://spartan.ng/documentation/version-support)
- [Spartan data-table implementation](https://spartan.ng/components/data-table)
- [OpenNG/Optimus roadmap](https://optimus.openng.org/roadmap)
- MicrobeTrace repository static scan on branch `codex/primeng-replacement`, July 31, 2026.
