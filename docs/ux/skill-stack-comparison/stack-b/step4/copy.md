# `/impeccable clarify`: board strings (step 4)

Terms confirmed with the user: avoid the word "Bucket" in UI copy (use each Bucket's own name, or "list" where a generic word is needed), and say **task** instead of todo. Voice: PRODUCT.md (calm, warm, gives a next step and permission to stop; no idioms).

| Where | Before | After | Why (clarify rule) |
|---|---|---|---|
| Board header, status | Planning today / tomorrow / ahead / earlier | Planning for today / for tomorrow / Planning ahead / Planning for an earlier day | Names the day the plan is for |
| Header, primary action | Complete day | Wrap up the day | Same verb as the recap ("is wrapped up"); outcome, not mechanism |
| Disabled reason (visible + `aria-describedby`) | Complete day is disabled while planning ahead. | Today is wrapped up. You can wrap up the next day once it starts. | Says why and when it comes back, not just that it's disabled |
| Complete-day error toast | raw `error.message` or "Could not complete day" | "Couldn't wrap up the day" + "Try again in a moment." | No developer text as the primary message; recovery step |
| End-of-day recap headline | `2026-10-19 is wrapped` | `Monday 19 is wrapped up` | No raw period keys |
| Recap step | No migration needed / All todos are completed, so this step is skipped. | Nothing to carry over / No unfinished tasks to move. | Drops "migration" jargon; also true on an empty day |
| Recap button | Close and plan tomorrow | Plan tomorrow | Action only |
| Column list name (SR) | `<Bucket> Todos` | `<Bucket> tasks` | Term |
| Add button (SR) | Add todo to `<Bucket>` | Add task to `<Bucket>` | Term |
| Card controls (SR) | Drag Pay rent · Mark Pay rent as done | Drag "Pay rent" · Mark "Pay rent" as done | Quotes delimit user text; matches variant A |
| Move failed toast | Could not move Todo / Your board was restored. Refreshing affected Buckets now. | Couldn't move the task / It's back where it was. Try again in a moment. | Plain words, recovery, no "Buckets" |
| Stale move toast | Board refreshed / Todo positions changed before your move completed. Review the latest order and try again. | That move didn't go through / Your tasks changed while you were moving this one. The latest order is showing now, so try again. | Leads with what happened to the user's action |
| Toggle failed toast | Could not update Todo / Your change was undone. Please try again. | Couldn't save that change / The task is back as it was. Try again in a moment. | Term, recovery |
| Drag announcements | Picked up "X". Use the arrow keys to choose a Bucket. · Over This week. · Not over a Bucket. · "X" dropped outside a Bucket. Nothing moved. | Picked up "X". Use the left and right arrow keys to choose where it goes. · Over This week. · Not over a list. · "X" wasn't moved. | No "Bucket"; names which keys |
| Drag instructions (SR) | To drag, press Space, then use the left and right arrow keys to move between Buckets… | To move a task, press Space, choose where it goes with the left and right arrow keys, then press Space again. Press Escape to cancel. The Move button does the same without dragging. | Task first, then keys; points to the alternative |
| Variant A: moving banner | Moving "X". Choose a Bucket, or press Escape to cancel. | Moving "X". Choose where it should go. (SR adds: "…or press Escape to cancel.") | Visible text drops the keyboard-only hint; a Cancel button is next to it |
| Variant A: nav name (SR) | Buckets | Lists | No "Bucket" |
| Variant A: tab name (SR) | `This week, 5 todos` | `This week, 5 tasks` (singular "1 task") | Term, pluralisation |
| Variant A: "Move here" (SR) | Move here ×4 | Move to `<Bucket name>` (visible text stays "Move here") | Unique names out of context |
| Variant A: counts | 5 todos | 5 tasks / 1 task | Term, pluralisation |
| Variant A: empty states | Nothing here yet. | Inbox: Your inbox is empty. · Today: Nothing left for today. Move something in from this week, or take the rest of the day off. · Tomorrow: Nothing planned for tomorrow yet. Move something in from this week. · Others: Nothing planned for this month yet. | Explains the state; gives a next step and permission to stop (brand voice) |
| Variant A: move toast | Moved "X" to This week | Moved "X" to This week. | Sentence punctuation |

**Left unchanged on purpose**

- The recap dialog's built-in timeline ("Review ended buckets", "Open the board: The board opens after this lifecycle step is resolved.", "Review the bucket lifecycle before moving on."). It is shared with the migration recap, a separate surface.
- The region name "Productivity Up board" (SR only). The verify harness and its template journey locate the board by it.
- Variants B and C (not picked) and the prototype switcher.
