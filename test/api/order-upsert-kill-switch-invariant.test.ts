// test/api/order-upsert-kill-switch-invariant.test.ts
// [GAP-3] Checkout Order UPSERT — STRIPE_PI_WEBHOOKS_ENABLED kill-switch invariant.
//
// PR2 (Tasks 5.1, 5.2): The endpoint MUST behave identically whether
// `STRIPE_PI_WEBHOOKS_ENABLED` is unset, false, or true. None of the
// new code (services/upsert.ts, controllers/order.ts, routes/01-custom.ts)
// is permitted to read the flag.
//
// Note: the flag NAME may legitimately appear in DOCSTRINGS (as part
// of documenting the invariant itself — see upsert.ts header). The
// invariant is "no runtime reads of the flag", i.e. no
// `process.env.STRIPE_PI_WEBHOOKS_ENABLED` access.
//
// Reference: obs #1748 (Gap #3 ↔ kill-switch decoupling).

import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

describe('[GAP-3] STRIPE_PI_WEBHOOKS_ENABLED kill-switch invariant (Phase 5)', () => {
    const files = [
        'src/api/order/services/upsert.ts',
        'src/api/order/controllers/order.ts',
        'src/api/order/routes/01-custom.ts',
    ]

    it('5.1a [Phase 5] new files do NOT read process.env.STRIPE_PI_WEBHOOKS_ENABLED', () => {
        // The invariant is "no runtime reads of the flag". The only way
        // to read process.env.STRIPE_PI_WEBHOOKS_ENABLED is via the
        // process.env access — comment lines mentioning the flag name
        // are documentation, not violations.
        const filesArg = files.join(' ')
        let output = ''
        try {
            output = execSync(
                `git grep -n "process.env.STRIPE_PI_WEBHOOKS_ENABLED" ${filesArg}`,
                { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
            )
        } catch (e: any) {
            output = (e.stdout || '').toString()
        }

        expect(output.trim(), 'process.env.STRIPE_PI_WEBHOOKS_ENABLED must not be read').toBe('')
    })

    it('5.1b [Phase 5] in-memory file content does NOT access process.env.STRIPE_PI_WEBHOOKS_ENABLED', () => {
        // Belt-and-suspenders: even if .gitignore hides something from
        // grep, the file contents must not contain the env access.
        for (const rel of files) {
            const abs = path.resolve(process.cwd(), rel)
            const content = readFileSync(abs, 'utf8')
            // Strip line/block comments before checking — we only care
            // about actual code, not documentation that mentions the flag.
            const stripped = content
                .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
                .replace(/^\s*\/\/.*$/gm, '') // line comments (start of line)
                expect(
                    stripped.includes('process.env.STRIPE_PI_WEBHOOKS_ENABLED'),
                    `${rel} must not read process.env.STRIPE_PI_WEBHOOKS_ENABLED`,
                ).toBe(false)
        }
    })

    it('5.1c [Phase 5] import-of-strapi-config does not pull in flag refs', () => {
        // The endpoint's three files MUST NOT import any module that
        // re-exposes STRIPE_PI_WEBHOOKS_ENABLED (e.g. config/stripe.ts).
        // This is a structural check: any import path that could
        // surface the flag is flagged.
        for (const rel of files) {
            const abs = path.resolve(process.cwd(), rel)
            const content = readFileSync(abs, 'utf8')
            expect(
                /config\/stripe|stripe-validation/i.test(content) &&
                    /STRIPE_PI_WEBHOOKS_ENABLED/.test(content),
                `${rel} must not import stripe config that surfaces STRIPE_PI_WEBHOOKS_ENABLED`,
            ).toBe(false)
        }
    })

    it('5.2 [Phase 5] flag reference in docstrings only (documented invariant, not a violation)', () => {
        // Sanity check: the flag NAME may legitimately appear in
        // docstrings as part of documenting the invariant itself. We
        // assert that the only occurrences are inside JSDoc/line
        // comments — i.e. NOT in code lines.
        for (const rel of files) {
            const abs = path.resolve(process.cwd(), rel)
            const content = readFileSync(abs, 'utf8')
            const lines = content.split('\n')
            const codeLines = lines.filter((line) => {
                const trimmed = line.trim()
                return (
                    trimmed.length > 0 &&
                    !trimmed.startsWith('*') &&
                    !trimmed.startsWith('/*') &&
                    !trimmed.startsWith('*/') &&
                    !trimmed.startsWith('//')
                )
            })
            const flagInCode = codeLines.some((line) =>
                line.includes('STRIPE_PI_WEBHOOKS_ENABLED'),
            )
            expect(flagInCode, `${rel} must not reference STRIPE_PI_WEBHOOKS_ENABLED in code lines`).toBe(false)
        }
    })
})