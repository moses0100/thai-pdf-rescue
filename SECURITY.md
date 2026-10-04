# Dependency status

Checked on 2026-10-04. The development-only lint dependency chain
`eslint-config-next → fast-glob → micromatch → braces` has advisory
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
The upstream advisory currently lists no patched braces version. npm reports
five affected dependency nodes for this one underlying advisory.

`npm audit --omit=dev` reports zero vulnerabilities, and `npm ls braces --omit=dev`
shows braces is absent from production dependencies. PDF processing does not
accept glob patterns and happens in the browser. The affected chain is used
by lint tooling; this limits exposure to development/CI execution, but does
not make the dependency itself fixed. We retain the compatible Next.js lint
configuration rather than apply npm's suggested framework downgrade.

Use the supplied fixed lint commands and review dependency changes before
running them. Update the lockfile when a compatible upstream fix is released.
