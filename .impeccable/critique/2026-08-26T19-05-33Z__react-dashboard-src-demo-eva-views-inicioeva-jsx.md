---
target: eva-inicio
total_score: 26
max_score: 32
na_heuristics: 7,10
p0_count: 0
p1_count: 3
timestamp: 2026-08-26T19-05-33Z
slug: react-dashboard-src-demo-eva-views-inicioeva-jsx
---
#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Live badge/pulse/loading states are solid, but `UltimaLectura` returns `null` outright when `fecha` is falsy — the trust badge silently vanishes instead of showing a pending state |
| 2 | Match System / Real World | 4 | Spanish copy is precise and domain-accurate ("fuera de límite", "en aviso", "en banda") |
| 3 | User Control and Freedom | 3 | Dual CTA models two real intents well; ceiling is naturally capped on a landing screen with no destructive actions |
| 4 | Consistency and Standards | 4 | Reuses `SectionLabel`, panel/shadow idioms, `fadeInUp` timing and DESIGN.md tokens throughout |
| 5 | Error Prevention | 3 | No unit fabrication on signals without units; no destructive actions present |
| 6 | Recognition Rather Than Recall | 4 | Four cards show live data + icon + label, not memorized menu items |
| 7 | Flexibility and Efficiency | n/a | Persuade-mode landing screen for a first-time prospect; no power-user path expected |
| 8 | Aesthetic and Minimalist Design | 2 | Detector confirms real contrast and shadow-noise problems on top of five simultaneous hero background layers (gradient, 2 blobs, masked 3D, flow SVG) |
| 9 | Error Recovery | 3 | "Sin conexión con el servidor por ahora" is calm and honest, correctly avoids alarm vocabulary |
| 10 | Help and Documentation | n/a | Presenter-driven sales demo; in-app help is out of scope by design |
| **Total** | | **26/32** | **Good (81%)** |

Heuristic 8 was lowered from Assessment A's source-only 3/4 after Assessment B's rendered-page evidence (6 low-contrast findings, 9 thin-border-wide-shadow findings, a real text-overflow clip) confirmed the layering risk Assessment A flagged from code alone was not just theoretical.

#### Design Specificity Verdict

**LLM assessment**: This would not survive being dropped into an unrelated SaaS product unchanged. The differentiating content — a live-counting "N / 8 señales" figure backed by a real tank-level sparkline, a rotating 3D twin bleeding through at 60% opacity, a flow-trace SVG that only tints when there's real flow, and a 3-node pipeline that names ICONICS/AssetWorX/Hyper Historian literally — is specific enough that deleting the generic chrome (gradient, two blobs, `ArrowRight` CTA) would gut the file. The generic-SaaS tells that do exist are structural scaffolding, not the persuasive payload. Verdict: authored for this product.

**Deterministic scan**: The CLI regex scanner (`detect.mjs --json`) returned a clean `[]` (exit 0) on `InicioEva.jsx` and its three sibling dependency files — but that mode only pattern-matches source text, and this file's problems are computed-style ones (contrast ratios, rendered shadow width, actual DOM overflow) that regex can't see. The browser-mode scan against the live rendered page at `localhost:5173` told a different story: **33 elements flagged, 37 individual findings**:

| Rule | Count | Detail |
|---|---|---|
| `gpt-thin-border-wide-shadow` | 9 | "1px border + 24px shadow blur" |
| `dark-glow` | 8 | Colored box-shadow glow (`#5c82f5`) on dark background |
| `low-contrast` | 6 | Ratios from 2.4:1 to 4.4:1 against the 4.5:1 floor — worst offender: white text (`#ffffff`) on `#8aa3fa` at 2.4:1 |
| `ai-color-palette` | 5 | "Cyan neon text on dark background" (×4), "Cyan gradient background" (×1) |
| `tiny-text` | 3 | 11.5px body text |
| `layout-transition` | 2 | `transition: width` |
| `undersized-ui-text` | 2 | 10.5px "ENTERPRISE" label and the build-hash chip, both under the 11px floor |
| `text-overflow` | 1 | A div overflowing its box by 30px |
| `overused-font` | 1 | Inter at 70% of all text on the page |

This is a real gap worth naming: the file is clean by static scan and flagged 37 times by rendered evidence. The CLI result should not be read as "clean" for this project going forward — the browser pass is the one that matters for CSS-in-JS/inline-style-heavy code like this.

Two of these look like one systemic root cause rather than nine-plus independent bugs: `gpt-thin-border-wide-shadow` (9×) and `dark-glow` (8×) both trace to the same `--tv-shadow`/`t.shadowHover` token pattern reused across the four `TarjetaVista` cards ([InicioEva.jsx:456](react-dashboard/src/Demo-EVA/views/InicioEva.jsx#L456)) — fix the token once, and most of these 17 findings likely clear together. The `low-contrast` and `ai-color-palette` findings are more concerning because they land squarely on dark-mode-specific values that aren't visible in the light-mode DESIGN.md token sheet at all — DESIGN.md documents only light-mode hex values, and the dark theme (confirmed live in the screenshot: near-black `#0B0E16` background, `#151B27` panels) appears to have accent/text pairings that were never contrast-checked the way the light palette was.

**Visual overlays**: Browser injection succeeded (mutation confirmed, `detect.js` loaded via a temporary live-server on port 8400, console read back "33 anti-patterns found"). No persistent overlay tab remains open in your browser — the live-server was stopped after evidence collection per the skill's cleanup requirement, so there is no `[Human]` tab to check right now. Two screenshots (desktop full-page, mobile 390px) were captured and are attached below for reference; the desktop full-page shot visibly confirms the `text-overflow` finding: the Assets card's body text ("su valo[r]" cut off) is clipped by the floating assistant-launcher button that overlaps its bottom-right corner.

#### Overall Impression

This is a genuinely well-thought-through screen — the code comments show a team that argued itself out of a looping-particle animation, caught its own near-miss of faking a trend line for a number that has none, and built a verified `prefers-reduced-motion` chain rather than just asserting one. The gut reaction reading the rendered page, though, is that the dark theme wasn't held to the same bar as the documented light palette: six low-contrast pairings and a floating action button that clips real content on the very card row meant to be the "co-equal four entry points" moment. The single biggest opportunity is closing that light/dark parity gap — the light-mode design system in DESIGN.md is disciplined; the dark-mode values that actually ship don't yet have the same rigor behind them.

#### What's Working

- **The sparkline-behind-the-number is honest data, not decoration.** `CifraEnVivo` ([InicioEva.jsx:357-365](react-dashboard/src/Demo-EVA/views/InicioEva.jsx#L357-L365)) draws the tank-level series behind the "8/8" count instead of fabricating a trend line for a number that has no history of its own — the code comment shows the team caught this dishonesty risk in its own first draft and corrected it.
- **Binary, non-metaphorical flow state.** `TrazoFlujo`'s `hayCaudal = !sistema.enReposo` ([InicioEva.jsx:400-403](react-dashboard/src/Demo-EVA/views/InicioEva.jsx#L400-L403)) rejects a naive threshold on raw flow because residual flow at rest (~0.12) isn't a clean zero — real domain literacy, not surface polish.
- **The reduced-motion path is verified, not asserted.** `usePrefersReducedMotion` plus the CSS override that also zeroes `animation-delay`, plus `useEnVista`'s safe `visible=true` default when reduced-motion is set, form a complete degradation chain, confirmed by reading the actual hook and CSS, not just the comment claiming it.
- **Edge cases degrade honestly.** When a signal has no reading, `VISTAS[].dato()` returns `null` and the "Ahora mismo" strip simply doesn't render rather than showing a fake placeholder — held up under adversarial "what if all 8 signals are `sin_dato`" testing.

#### Priority Issues

**[P1] Dark-theme contrast never got the light-theme's rigor.** The live rendered page (dark mode, which is what the screenshots show as the actual current state) has 6 low-contrast findings, the worst at 2.4:1 (white text on `#8aa3fa`) against a 4.5:1 WCAG AA floor — nowhere close. DESIGN.md documents contrast-conscious light-mode tokens but the "each dark value chosen against its own background" principle the Do's/Don'ts list requires ("Don't derivar el tema oscuro del claro por fórmula") doesn't appear to have been contrast-tested for these specific pairings.
**Why it matters**: this is a sales-demo screen — a prospect squinting at low-contrast text during a live pitch undermines the exact "the data is real and legible" trust the screen exists to build.
**Fix**: audit every text/background pair flagged (`#5f6981` on `#0b0e16` at 3.5:1, `#5c82f5` on `#1b2436` at 4.4:1, and the 2.4:1 white-on-`#8aa3fa` pairing) and raise them to 4.5:1, likely by darkening the accent backgrounds these labels sit on or lightening the text tokens.
**Suggested command**: `/impeccable audit` (accessibility pass, dark theme specifically)

**[P1] Nine shadow/glow findings trace to one reused token, and it's tuned for a light background.** `gpt-thin-border-wide-shadow` (9×) and `dark-glow` (8×) both fire on the `--tv-shadow`/`t.shadowHover` pattern shared by all four `TarjetaVista` cards ([InicioEva.jsx:456](react-dashboard/src/Demo-EVA/views/InicioEva.jsx#L456)), plus the pipeline nodes and other panels using `t.shadow`. A thin 1px border with a wide diffuse shadow reads as intentional "ambient elevation" on the light `#F5F6FA` page DESIGN.md specifies, but on the actual dark `#0B0E16` background it renders as a colored glow halo around every card — a different visual language than the one DESIGN.md's Elevation section describes.
**Why it matters**: 17 combined findings from one token is a systemic miss, not noise — and it means the "restrained ambient shadow" identity the light theme has doesn't currently exist in the theme prospects are most likely to actually see live (the screenshots show dark mode as the active state).
**Fix**: give dark mode its own shadow recipe (softer blur, no colored glow, or a much lower opacity) rather than reusing the light-mode shadow values verbatim.
**Suggested command**: `/impeccable polish` (dark theme shadow system)

**[P1] Keyboard focus is asymmetric between the two CTA buttons and the four view cards.** The hero's `Button` component gets a visible `:focus-visible` accent ring (via the shared `.app-btn` class, `index.css:90`), but `.eva-tarjeta-vista` — the four `TarjetaVista` cards — has a `:hover` rule only ([InicioEva.jsx REJILLA block, lines 165-172](react-dashboard/src/Demo-EVA/views/InicioEva.jsx#L165-L172)); no `:focus-visible` rule exists for it anywhere in `index.css` or the `REJILLA` block.
**Why it matters**: a keyboard-only user tabbing past the hero reaches four buttons — the entire "four ways to enter" navigation — with no visible indicator of which one has focus, in many browsers with custom button styling this defaults to no visible ring at all.
**Fix**: add `.eva-tarjeta-vista:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }` to the `REJILLA` block, matching the existing accent token.
**Suggested command**: `/impeccable audit` (keyboard accessibility)

**[P2] A floating action button clips real card content.** The desktop full-page screenshot shows the assistant-launcher FAB (bottom-right, circular blue) overlapping the "Assets" card's description text, cutting off "su valo[r]" — this matches the detector's `text-overflow` finding (a div overflowing its box by 30px).
**Why it matters**: this is the last card in the "cuatro formas de verlo" row — the row the design contract calls a co-equal set of four entry points — and one of the four is now partially unreadable behind a floating chat button in the actual shipped layout.
**Fix**: either give the card grid bottom padding/margin sized to clear the FAB's footprint, or constrain the FAB's position so it never overlaps the last grid column at common viewport widths.
**Suggested command**: `/impeccable layout`

**[P2] `UltimaLectura` silently disappears instead of showing a pending state.** `UltimaLectura` returns `null` when `fecha` is falsy ([base.jsx:240](react-dashboard/src/Demo-EVA/components/base.jsx#L240)), so if the first reading is slow to arrive, the "En vivo" badge — the single strongest trust signal in the hero — is simply absent rather than shown as "waiting."
**Why it matters**: on a live sales demo over venue wifi, the multi-second window before first data arrival is exactly when a first-time prospect forms their "is this real or fake" judgment, and an absent badge reads as more broken than a visibly-pending one.
**Fix**: give `UltimaLectura` an explicit pending state (dim static dot + "Conectando…") instead of returning `null`.
**Suggested command**: `/impeccable harden`

#### Persona Red Flags

**Sam (Accessibility-Dependent User)**: Tabbing through the hero, Sam reaches the two CTA buttons with a clear focus ring, then reaches the four view cards with no visible focus indicator at all (the P1 above) — a low-vision keyboard user loses track of position exactly at the screen's main navigation decision. Separately, the six `low-contrast` findings mean several text/background pairings fall as low as 2.4:1, well under the 4.5:1 AA floor Sam's low-vision usage depends on.

**Jordan (Confused First-Timer)**: Before `useSistemaAgua()` resolves, Jordan sees "···" as the number with a synchronous frame where the explanatory "conectando con el servidor ICONICS…" line hasn't rendered yet. On a bad demo-venue connection this ambiguous instant is stretched exactly when a first-timer is deciding whether the number is real. If the connection stalls further, the "En vivo" badge just vanishes (P2 above) rather than confirming "still trying" — two compounding signals of "is this broken" at the worst possible moment for this persona.

**Riley (Deliberate Stress Tester)**: Riley's "what happens at 0 signals" edge case actually holds up well — each card's `dato()` function returns `null` cleanly and the UI shows icon+label+description with no fake data (a strength, not a flag). Where Riley would find a real gap: the Assets card's text-overflow under the FAB is a genuine "the UI promises four full readable cards but delivers three and a partial one" inconsistency, caught exactly by the kind of full-page, all-viewport check this persona runs.

#### Minor Observations

- `overused-font` (Inter at 70% of text) is likely a false-positive-adjacent finding: DESIGN.md explicitly commits to Inter as the interface body font system-wide, so a single-font dominance reading is expected, not a violation — worth an `impeccable-disable` waiver comment if this rule keeps firing on future scans of this codebase.
- The two `undersized-ui-text` findings (10.5px "ENTERPRISE" sidebar label, the `d7249b0-dirty` build-hash chip) are outside `InicioEva.jsx` itself (they're app-shell chrome, not this view) but were caught because they're present on every page including this one — worth a note for whoever owns the app shell rather than this file.
- `layout-transition` (2×, `transition: width`) is a performance-adjacent finding rather than a visual one — width transitions are more prone to layout thrashing than `transform`-based ones; low severity but easy to swap if touching that code anyway.
- The `t.accentGradientEnd` dead-token bug the file's own comment describes (line 592-595) was already caught and fixed by the team before this review — noted only for completeness.

#### Questions to Consider

- If the dark theme is what most demo viewers will actually see (per the screenshots), should DESIGN.md's contrast obligations be re-scoped to treat dark mode as co-primary rather than a derived companion to the light palette?
- The four-card grid is intentionally "co-equal" per the design contract — but given Jordan's persona walkthrough, would a prospect with only minutes benefit from one card being told "start here," even at the cost of breaking strict co-equality?
- Given `UltimaLectura` silently returns `null` with no fallback, has this screen actually been tested end-to-end with `VITE_ICONICS_CHAOS` enabled to see what a real multi-second stall looks like, or is the current handling optimism that's never been forced to prove itself?
