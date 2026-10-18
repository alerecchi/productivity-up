# Themes, presets, fonts, and icon sets for shadcn/ui on Tailwind v4

Research date: 2026-10-18. Answers [#139](https://github.com/alerecchi/productivity-up/issues/139), part of map [#137](https://github.com/alerecchi/productivity-up/issues/137).

## Decision summary

- **Style:** `base-vega` still works, but it is shadcn's "classic shadcn/ui look". That is the generic look the overhaul is trying to leave behind. The strongest candidates are **Luma** (soft, rounded, calm, with Vega-sized controls) and **Rhea** (Luma's shape with one-step-smaller controls). Prototype the board on both at 375 px and at desktop width, then pick one. **Luma is the top recommendation** because the app is mobile-first and Rhea's smaller controls (32 px default button) work against touch targets.
- **Mechanism:** keep Base UI. Build the theme in shadcn/create, then apply it with `shadcn apply --preset <code>` (whole preset) or `--only theme,font` (keeps the current component code). The resulting CSS variables then become this repo's hand-owned brand tokens in `src/styles/app.css`.
- **Fonts:** Manrope is still a reasonable *heading* face, but it is a weak *body* face for this app. It has no italic and no optical sizing. **Inter for body and UI, with Manrope or another display face for headings**, is the safest pairing. Geist or Figtree are the alternatives if a single family is wanted.
- **Icons:** stay on **lucide**, and upgrade from `lucide-react` 0.562 to 1.x. Lucide is shadcn's default, it is ISC-licensed, and it has the largest shadcn ecosystem. The only switch worth considering is **Phosphor**, if the brand wants filled or duotone states (for example a filled icon for a completed todo). Every switch needs approval under AGENTS.md.

Two candidate presets are ready to open and tweak. They are encoded and verified with `shadcn preset decode` (CLI 4.22.0):

| Candidate                 | Preset                                                              | Contents                                                                       |
| ------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| A: Luma (recommended)     | [`b6AnrHgo3U`](https://ui.shadcn.com/create?preset=b6AnrHgo3U)      | luma, base color mist, theme indigo, lucide, Inter body, Manrope headings       |
| A': Rhea (dense variant)  | [`b6AoSn0lc0`](https://ui.shadcn.com/create?preset=b6AoSn0lc0)      | same as A with the rhea style                                                  |
| B: Maia, warmer           | [`b2C6zbURM`](https://ui.shadcn.com/create?preset=b2C6zbURM)        | maia, stone, emerald, phosphor, Figtree                                        |
| C: Nova, tool-like        | [`b1YnRGw8O`](https://ui.shadcn.com/create?preset=b1YnRGw8O)        | nova, zinc, blue, tabler, Geist                                                |
| Current, for comparison   | [`b1Z5bakMa`](https://ui.shadcn.com/create?preset=b1Z5bakMa)        | vega, neutral, blue, lucide, Manrope, large radius (approximates today's setup) |

The current setup is approximate because `src/styles/app.css` uses hand-tuned oklch values, not a stock theme.

## 1. shadcn styles and presets

### What exists now

shadcn/create (launched Dec 2025) builds a project from a **style** plus a set of options. It rewrites component code, not only CSS variables. It supports Next.js, Vite, TanStack Start, and v0. [shadcn create changelog](https://ui.shadcn.com/docs/changelog/2025-12-shadcn-create)

The preset schema, read from the published `@shadcn/registry` 0.2.0 package (`dist/chunk-JSGATXUP.js`), which `shadcn` 4.22.0 depends on:

- **Bases:** `radix`, `base`, `aria`. Base UI became the default in July 2026. Radix is not deprecated. [Base UI as the default](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default)
- **Styles:** nova, vega, maia, lyra, mira, luma, sera, rhea.
- **Base colors (neutrals):** neutral, stone, zinc, gray, mauve, olive, mist, taupe.
- **Themes (accent):** the neutrals plus amber, blue, cyan, emerald, fuchsia, green, indigo, lime, orange, pink, purple, red, rose, sky, teal, violet, yellow. Chart colors use the same list.
- **Icon libraries:** lucide, hugeicons, tabler, phosphor, remixicon.
- **Fonts (body and heading):** inter, noto-sans, nunito-sans, figtree, roboto, raleway, dm-sans, public-sans, outfit, jetbrains-mono, geist, geist-mono, lora, merriweather, playfair-display, noto-serif, roboto-slab, oxanium, manrope, space-grotesk, montserrat, ibm-plex-sans, source-sans-3, instrument-sans, eb-garamond, instrument-serif. The heading font can be `inherit` or any of these.
- **Radius:** default, none, small, medium, large. **Menus:** color default, inverted, or translucent variants; accent subtle or bold.

### Style comparison

Descriptions come from the official changelogs. The default icon and font for each style come from the CLI's built-in style presets. Sizes are read from each style's registry `button.json` (`https://ui.shadcn.com/r/styles/base-<style>/button.json`).

| Style    | Official description                                                                                                                   | Default button / icon button | Button shape          | Shipped default icons / font     |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------- | -------------------------------- |
| **vega** (current) | "The classic shadcn/ui look."                                                                                         | h-9 / size-9 (36 px)          | rounded-md            | lucide / Inter                   |
| nova     | "Reduced padding and margins for compact layouts."                                                                                     | h-8 / size-8 (32 px)          | radius-based          | lucide / Geist                   |
| maia     | "Soft and rounded, with generous spacing."                                                                                             | h-9 / size-9                  | pill (`rounded-4xl`)  | hugeicons / Figtree              |
| lyra     | "Boxy and sharp. Pairs well with mono fonts."                                                                                          | h-8 / size-8                  | square (`rounded-none`) | phosphor / JetBrains Mono      |
| mira     | "Compact. Made for dense interfaces."                                                                                                  | h-7 / size-7 (28 px), `text-xs` | radius-based        | hugeicons / Inter                |
| **luma** | Softer surfaces, soft elevation, more open spacing, "calmer visual rhythm". Inspired by macOS Tahoe without the glass ([changelog](https://ui.shadcn.com/docs/changelog/2026-03-luma)) | h-9 / size-9                  | pill (`rounded-4xl`)  | lucide / Inter                   |
| **rhea** | "A more compact Luma" for focused product UIs where space matters. It tightens component sizes without changing `--spacing` ([changelog](https://ui.shadcn.com/docs/changelog/2026-05-rhea)) | h-8 / size-8                  | `rounded-2xl`         | lucide / Inter                   |
| sera     | Editorial style. Buttons are uppercase, `tracking-widest`, and square                                                                  | h-10 / size-10 (40 px)        | square                | lucide / Noto Sans + Playfair Display, taupe |

All of these are below the 44 px touch-target minimum by default. Whichever style is chosen, the design guide needs a mobile rule, such as a larger size variant or a hit-area expansion on touch. This is a project inference, not something shadcn documents.

### Fit for this app

- **Keep vega?** It works, but it keeps the "every shadcn app looks the same" problem. tweakcn's README cites that problem as its reason to exist ([tweakcn](https://github.com/jnsahaj/tweakcn)). Nothing technical forces a change.
- **Luma**: the best match for a calm planning tool with light and dark first-class. It keeps Vega's control sizes, which matters on mobile, and adds softness and elevation that suit cards on a board.
- **Rhea**: choose it if the desktop board with several bucket columns feels cramped in Luma. Expect to set touch sizes explicitly on mobile.
- **Maia**: similar softness to Luma with generous spacing, and an older style. Pick Luma over it unless the prototype prefers Maia's look.
- **Nova and Mira**: dense, tool-like (Linear or IDE feel). Mira's `text-xs` default is too small for a broad-audience, mobile-first app.
- **Lyra and Sera**: strong personalities (brutalist/mono, editorial). Sera could fit a landing page, but a style is project-wide, so neither suits the board.

### How to switch

- `npx shadcn@latest apply --preset <code>` applies a preset to an existing project. It reinstalls existing components and updates theme, colors, CSS variables, fonts, and icons. It **keeps the project's base (Base UI) and RTL settings**. [shadcn apply](https://ui.shadcn.com/docs/changelog/2026-04-shadcn-apply)
- `--only theme`, `--only font`, or `--only theme,font` applies part of a preset without touching component code. Only `theme` and `font` are supported. [Partial preset apply](https://ui.shadcn.com/docs/changelog/2026-04-partial-preset-apply)
- `shadcn preset resolve` finds the preset closest to the current project. `preset decode`, `url`, and `open` inspect and share codes. [Preset commands](https://ui.shadcn.com/docs/changelog/2026-04-preset-commands)
- The `components.json` docs still say style and base color "cannot be changed after initialization" ([components.json](https://ui.shadcn.com/docs/components-json)). `apply` is the newer, supported way around that, because it reinstalls the components. Expect it to overwrite local edits in `src/features/shared/components/ui/*`, so run it on a branch and review the diff. Some of those files have been edited in project commits (see `git log -- src/features/shared/components/ui`).
- The installed CLI is `shadcn` 3.8.5, and the latest is 4.22.0. `apply`, `preset`, and the luma, rhea, and sera styles need the 4.x CLI.

### Theming mechanics

These are unchanged and fit the current file.

- shadcn tokens live under `:root` and `.dark` and are exposed to Tailwind with `@theme inline`. New tokens (for example a per-bucket color or `--warning`) follow the same pattern. `--radius` drives a derived scale from `radius-sm` (0.6x) to `radius-4xl` (2.6x). [shadcn theming](https://ui.shadcn.com/docs/theming)
- Tailwind v4 namespaces: `--color-*`, `--font-*`, `--radius-*`. Use `@theme inline` when a theme variable references another variable, as `--font-sans: var(--font-inter)` does. Tailwind's own palette is defined in oklch. [Tailwind theme variables](https://tailwindcss.com/docs/theme)
- `shadcn/typeset` (July 2026) is an owned CSS file for styling rendered HTML and markdown. It is relevant for the legal pages and long landing copy. [Typeset changelog](https://ui.shadcn.com/docs/changelog/2026-07-typeset)

## 2. Fonts

### Is Manrope still a good choice?

Metadata comes from the Fontsource API. Metrics and OpenType features come from the Fontsource latin 400 TTFs, inspected with fontTools. Subsetting can drop features, so treat a missing feature as "not confirmed", not as "absent".

| Font            | Weights (variable) | Italic | Axes            | x-height / em | `tnum` | Notes                                                        |
| --------------- | ------------------ | ------ | --------------- | ------------- | ------ | ------------------------------------------------------------ |
| Manrope (current) | 200 to 800       | **no** | wght            | 0.540         | yes    | Geometric-grotesk hybrid. Distinctive in headings. No italic for emphasis or notes |
| Inter           | 100 to 900         | yes    | ital, **opsz**, wght | 0.546    | yes    | Designed for UI text. The optical-size axis tightens display sizes. shadcn default for vega, luma, rhea, and mira |
| Geist           | 100 to 900         | yes    | ital, wght      | 0.530         | yes    | Vercel's UI face, nova default. Pairs with Geist Mono          |
| Figtree         | 300 to 900         | yes    | ital, wght      | 0.500         | yes    | Friendlier and rounder. Maia default                         |
| Public Sans     | 100 to 900         | yes    | ital, wght      | 0.517         | yes    | Neutral, government-UI heritage                              |
| Instrument Sans | 400 to 700         | yes    | ital, wght      | 0.510         | yes    | Characterful but narrower weight range                       |
| DM Sans         | 100 to 900         | yes    | ital, wght      | 0.504         | not seen in subset | Low-contrast geometric                    |
| Outfit          | 100 to 900         | no     | wght            | 0.475         | yes    | Small x-height and no italic, so better kept for display     |

Sources: [Fontsource API](https://api.fontsource.org/v1/fonts/manrope), [Fontsource variable axes](https://api.fontsource.org/v1/variable/inter). All of these fonts are OFL-1.1.

Assessment (inference from the data above):

- Manrope's x-height and tabular numerals are fine for UI. Its real gap is the **missing italic**. Browsers synthesize a slanted Manrope, which is visibly worse. That matters for copy-heavy surfaces such as legal pages, onboarding hints, and the landing page.
- **Inter body with Manrope headings** keeps the brand personality the app already has and fixes the body-text gaps. shadcn models this split directly with `font` and `fontHeading` (Sera ships Noto Sans with Playfair Display).
- **Alternatives:** Geist alone (crisper, more "dev tool") or Figtree alone (warmer, rounder, pairs with Luma or Maia).
- Use `tabular-nums` (`font-variant-numeric`) on counts and dates. Inter, Manrope, Geist, and Figtree all expose `tnum`.
- Install through `@fontsource-variable/*`, as the repo already does for Manrope. Every new font package needs approval and an AGENTS.md entry.

## 3. Icon libraries

| Library    | shadcn `iconLibrary` | React package (latest)                                      | Size and styles                                                              | License                                     | Trade-off                                                                                         |
| ---------- | -------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Lucide** (current) | `lucide` | `lucide-react` 1.59.0 (repo is on ^0.562.0)                 | 1600+ icons, single outline style                                            | ISC                                         | Default for most shadcn styles, so registry blocks and examples use it. v1 removed brand icons (use Simple Icons), made icons `aria-hidden` by default, and added `LucideProvider` for global size and stroke. [guide](https://lucide.dev/guide/), [v1](https://lucide.dev/guide/version-1) |
| Phosphor   | `phosphor`           | `@phosphor-icons/react` 2.1.10                              | Weights thin, light, regular, bold, fill, duotone                            | MIT                                         | The weight prop allows outline-to-filled state toggles (done/not done) and has a friendlier character. Its repos were last pushed in Jan 2026, so expect a slower cadence. [README](https://github.com/phosphor-icons/react) |
| Tabler     | `tabler`             | `@tabler/icons-react` 3.49.0                                | 6238 icons, 24x24 grid, 2 px stroke, outline plus filled                     | MIT                                         | Largest free MIT set and very similar in feel to Lucide. Switching costs churn for little visual gain. [README](https://github.com/tabler/tabler-icons) |
| Hugeicons  | `hugeicons`          | `@hugeicons/react` 1.1.10 + `@hugeicons/core-free-icons`    | 6000+ free (stroke rounded only). Pro adds 10 styles and 60k icons, $99/yr   | Free set MIT per the README                 | Polished and rounded, the default for Maia and Mira. The extra styles are paywalled. [README](https://github.com/hugeicons/hugeicons), [pricing](https://hugeicons.com/pricing) |
| Remix Icon | `remixicon`          | `@remixicon/react` 4.9.0                                    | Line plus fill pairs                                                         | Remix Icon License v1.0 (custom)            | The custom license **forbids using the icons as a logo or brand identifier**. That matters if an icon becomes part of the brand mark. [License](https://github.com/Remix-Design/RemixIcon/blob/master/License) |

Recommendation: **Lucide 1.x**. Phosphor is the only alternative with a real product reason (filled or duotone states). Whatever is chosen, the logo must not be a stock icon. That rules out Remix Icon outright, and the design guide should forbid it for every set.

## 4. Websites to browse for inspiration

### shadcn themes and presets

- [shadcn/create](https://ui.shadcn.com/create): the official builder. It previews styles, bases, colors, fonts, icons, and radius live, and gives a preset code you can `apply`. Start here. The links in the decision summary open the candidates directly.
- [tweakcn](https://tweakcn.com): an open-source visual theme editor with many ready-made presets, for tuning every shadcn token by eye and exporting the CSS ([repo](https://github.com/jnsahaj/tweakcn)).
- [ui.jln.dev](https://ui.jln.dev): "10000+ Themes for shadcn/ui". Good for fast browsing of color combinations to steal from ([repo](https://github.com/jln13x/ui.jln.dev)).
- [shadcn/studio theme generator](https://shadcnstudio.com/theme-generator): a theme generator with named theme starters and style presets. Some features (AI generation, contrast validation) are paid.
- [shadcn Directory](https://ui.shadcn.com/docs/directory): community registries built into the CLI. Useful for seeing how other registries style the same components.

### Color and palette

- [Realtime Colors](https://www.realtimecolors.com): try text, background, primary, secondary, accent, and fonts on a realistic page, toggle light and dark, and export to Tailwind or oklch (it has a shadcn preset).
- [Harmonizer](https://harmonizer.evilmartians.com): generates oklch palettes with consistent APCA contrast at every level. Best for building a per-bucket color scale that stays readable in both themes ([repo](https://github.com/evilmartians/harmonizer)).
- [OKLCH picker](https://oklch.com): a precise oklch picker and converter with P3 and sRGB gamut warnings, for hand-tuning `app.css` values.
- [Tailwind color palette](https://tailwindcss.com/docs/colors): the oklch reference scales that shadcn themes are built from.

### Fonts and pairing

- [Google Fonts](https://fonts.google.com): type your own UI strings and compare candidates side by side. All fonts in the table above are there.
- [Fontsource](https://fontsource.org): the package source the repo uses. Shows the variable axes, weights, and install snippets.
- [Fontjoy](https://fontjoy.com): generates heading and body pairings, lets you lock one font and shuffle the other, and previews with your own copy.
- [shadcn/create](https://ui.shadcn.com/create): also the quickest way to see a body and heading pair on real shadcn components.

### Icons

- [lucide.dev/icons](https://lucide.dev/icons): the current set, searchable, with a stroke and size playground.
- [phosphoricons.com](https://phosphoricons.com): preview all six weights side by side, which shows whether filled states help.
- [tabler.io/icons](https://tabler.io/icons): the largest free MIT outline and filled set.
- [hugeicons.com](https://hugeicons.com): browse the free stroke-rounded set. The pro styles are paywalled.
- [remixicon.com](https://remixicon.com): line and fill pairs. Mind the logo restriction.
- [Icônes](https://icones.js.org): one search across every Iconify set, for comparing the same concept (calendar, inbox, check) across libraries ([repo](https://github.com/antfu-collective/icones)).

## Open points for the brand ticket (#145)

- Pick Luma or Rhea after a board prototype at mobile and desktop widths.
- Decide the accent hue and whether buckets get their own color tokens. If they do, generate them with Harmonizer so contrast holds in light and dark.
- Decide Inter + Manrope, or a single family.
- Decide whether to stay on Lucide 1.x, or adopt Phosphor for filled states. Either way, upgrade `lucide-react` 0.x to 1.x or replace it, and upgrade the `shadcn` CLI from 3.x to 4.x so `apply` and the new styles are available. Both need the usual approval and an AGENTS.md update.
