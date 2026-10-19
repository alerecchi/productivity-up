# Assessment A (design review): written before detector/browser evidence

Target: src/features/board/prototype/variant-a-pick-and-place.tsx (/board?variant=A), plus today's /board as changed on this branch. Mode: Operate.

## Design specificity
Partly product-specific. The Bucket strip in the thumb zone, counts per horizon, "Pick up and place" between horizons, and empty states written in the brand voice ("take the rest of the day off") belong to this product. Everything else is the generic kanban/shadcn look: same-weight white cards, one blue primary for every icon and button, every Bucket drawn in the same colour. PRODUCT.md says colour should carry nearness (far = quiet, Today = vivid); variant A uses `text-primary` for all five Bucket icons, so the "someday → today" mechanism is invisible. Swap the labels and this is any todo app.

## Heuristics (variant A as the primary surface)
1 Visibility of status 3: aria-current tab, counts, moving banner, polite toast; optimistic moves show no pending state.
2 Match real world 3: "This week", "task", plain errors; "Planning for today" is still unexplained.
3 User control 2: picking can be cancelled (button + Escape), but moves and completions have no Undo.
4 Consistency 2: two boards in one route (today's board and ?variant=A) with different cards, controls and Bucket names ("Week 43 (19-25)" vs "This week"); B, C and the switcher are still shipped.
5 Error prevention 3: the source Bucket is disabled as a target; nothing destructive on the surface.
6 Recognition 2: Move is an icon-only ⇄ next to an icon-only grip; first-timers must guess which does what.
7 Flexibility 2: Move + keyboard drag; no shortcuts, no multi-select for a planning session.
8 Aesthetic/minimal 3: clean, but every card repeats two move affordances, and two blue primaries ("Wrap up the day", "+") compete at the top.
9 Error recovery 3: toasts say what happened and what to do.
10 Help 2: empty states guide; nothing explains what the horizons are for.
Total 25/40 (Acceptable).

## Cognitive load
Checklist failures: Visual hierarchy (two primaries at the top, equal-weight cards), Minimal choices (each card: checkbox, title, Move, Drag = 4 targets × N cards). 2 failures = moderate. The tab strip is 5 options, at the limit but fine for navigation.

## Emotional journey
Peak: placing a task into Today with one tap and getting "Moved … to Today." End: an empty Today that gives permission to stop. Valley: the first pick-up; nothing on the card says Move means "pick up and choose a list", so the banner appears as a surprise.

## Strengths
1. A no-drag move that works one-handed: thumb-zone Bucket strip, double use as navigation and as targets, focus routed to the targets.
2. Always-visible location: aria-current tab, a big Bucket heading with date and count.
3. Copy voice matches the brand (calm, next step, permission to stop) without guilt mechanics.

## Priority issues
- [P1] Variant A dropped information: tags are not rendered and the category is plain grey text (no colour), so a card shows less than today's board. Fix: bring back category colour and tags in a compact row. Command: $impeccable layout
- [P1] Colour carries no meaning: all five Buckets in one blue, so nearness (the core promise) is invisible. Fix: a quiet-to-vivid ramp across the strip and headings, coexisting with category colour. Command: $impeccable colorize
- [P2] Icon-only, doubled move affordances: ⇄ Move and the grip sit side by side on every card. Fix: label the action ("Move") on touch, or merge pick-up and drag into one handle that does both. Command: $impeccable distill
- [P2] Primary action placement on phone: "Wrap up the day" sits at the top, out of the thumb zone, and competes with "+". Fix: demote it, or move it into the Today view's end-of-list. Command: $impeccable layout
- [P2] No Undo for moves and completions. Fix: an Undo action in the move toast. Command: $impeccable harden

## Persona red flags
Casey (one-handed mobile): Bucket strip and Move are in reach; "Wrap up the day" and "+" are at the top of an 844 px screen. On today's board (no variant) Casey still gets 320 px columns scrolling sideways.
Jordan (first-timer): ⇄ and ⋮⋮ are unlabeled; "Planning for today" gives no clue what planning means; nothing says what Year/Month/Week are for.
Sam (screen reader/keyboard): good: named controls, focus moves to targets, named announcements. Red flag: the Bucket strip is a `<nav>` of buttons that changes meaning in pick mode; only the nav's name changes ("Choose where to move …"), the buttons don't announce state.

## Minor observations
- Desktop pick mode inserts "Move here" at the top of every column, shifting all cards down by about 52 px.
- Counts on the tab strip are 11 px.
- Today's board and variant A disagree on Bucket names ("Week 43 (19-25)" vs "This week").
- The prototype switcher is magenta and overlaps content on phones (a prototype tool, but it is in the captures).

## Questions
- What if the strip itself showed nearness, with the tabs warming from Inbox to Today?
- Does a card need both Move and Drag, or is one handle that you tap to pick and drag to move enough?
- Should the phone open on Today with "Wrap up the day" at the end of the list, where the day actually ends?
