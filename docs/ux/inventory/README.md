# Current UI inventory

A snapshot of every UI surface, state, and user-facing string in Productivity Up as of `main` at `be9022d` (2026-10-19). It is the input for the copy audit and for every prototype in the [UX, brand, and copy overhaul map](https://github.com/alerecchi/productivity-up/issues/137). It describes what the app does today, not what it should do.

- **This file:** every surface and its states, each linked to its screenshots.
- [`copy-inventory.md`](./copy-inventory.md): every user-facing string with its `file:line` location, grouped by surface.
- [`inconsistencies.md`](./inconsistencies.md): problems with spacing, components, tone, accessibility, and behaviour noticed while capturing.
- [`screenshots/`](./screenshots): 103 PNGs named `<surface>--<state>[--dark]--<desktop|mobile>.png`.

## How it was captured

- The app ran through `pnpm verify` (local Postgres, seed data, real browser). Desktop is 1440×900 and mobile is 390×844. Screenshots are full-page unless they show a dialog or popover.
- Dark screenshots were taken by adding the `.dark` class by hand. **The app has no theme switch.** `.dark` tokens exist in `src/styles/app.css`, but users never see them. The dark shots show how much of the UI already uses tokens and how much uses hard-coded colours.
- Mobile shots come from resizing the same session. The app has no mobile-specific layout, so this is the real mobile rendering.
- TanStack devtools were hidden. They appear in development builds only.
- Error toasts were triggered by making the browser drop server-function requests. Auth emails were rendered from their templates with sample data, because nothing is delivered locally.
- The journeys are throwaway files under `.verify/journeys/inventory-*.ts`, which is gitignored. They aren't committed.

## Routes

| Route                 | Who                         | What it shows                                                                                                                                                                                       |
| --------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                   | signed out                  | Placeholder: a lone "Sign out" button. Signed-in users are redirected to `/board`; unverified users to `/email-confirmation`.                                                                        |
| `/login`              | signed out                  | Auth card, Login tab                                                                                                                                                                                |
| `/signup`             | signed out                  | Auth card, Signup tab                                                                                                                                                                               |
| `/reset-password`     | anyone                      | Request link → link sent → (from email) change password. `?error=` shows "token expired".                                                                                                           |
| `/email-confirmation` | signed out / unverified     | "Check your email" with resend                                                                                                                                                                      |
| `/email-verified`     | email link target           | Spinner "Finishing verification..." then redirects to `/board` (or `/email-confirmation` on `?error=`). It redirects before render, so it was never visible.                                        |
| `/board`              | verified                    | Board. Signed out → `/login?redirect=…`; unverified → `/email-confirmation`.                                                                                                                        |
| `/migration`          | verified                    | Migration step flow, or "No migration needed"                                                                                                                                                       |
| any other path        | anyone                      | TanStack's default "Not Found" text. No custom 404 page exists.                                                                                                                                     |
| (document)            | —                           | `<title>` is "TanStack Start Starter" on every page; `public/manifest.json` still says "Create TanStack App Sample" / "TanStack App"; favicon and logos are TanStack's.                            |

## Surfaces and states

### App shell (header)

Sticky header on every page, including auth pages. It has no footer.

| State                           | Screenshots                                                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Signed out: logo + "Sign in"    | [desktop](./screenshots/login--default--desktop.png) · [mobile](./screenshots/login--default--mobile.png)                     |
| Signed in: logo + "Board" + avatar | [desktop](./screenshots/board--default--desktop.png) · [mobile](./screenshots/board--default--mobile.png)                  |
| User menu open                  | [desktop](./screenshots/user-menu--open--desktop.png) · [mobile](./screenshots/user-menu--open--mobile.png)                   |
| Sign-out error (inline in menu) | not captured (source only: "Failed to sign out. Please try again.")                                                          |
| Avatar with Google image        | not captured (Google sign-in isn't wired up; the image shows only if `user.image` is set)                                   |

### Home `/`

| State      | Screenshots                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------ |
| Signed out | [desktop](./screenshots/home--signed-out--desktop.png) · [mobile](./screenshots/home--signed-out--mobile.png)      |

### Auth card: login and sign-up

| State                                                 | Screenshots                                                                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login default                                         | [desktop](./screenshots/login--default--desktop.png) · [mobile](./screenshots/login--default--mobile.png) · [dark](./screenshots/login--default--dark--desktop.png) · [dark mobile](./screenshots/login--default--dark--mobile.png) |
| Login field errors                                    | [desktop](./screenshots/login--field-errors--desktop.png) · [mobile](./screenshots/login--field-errors--mobile.png)                               |
| Login password visible                                | [desktop](./screenshots/login--password-visible--desktop.png)                                                                                      |
| Login invalid credentials (form alert)                | [desktop](./screenshots/login--invalid-credentials--desktop.png) · [mobile](./screenshots/login--invalid-credentials--mobile.png)                 |
| Login submitting (spinner in button)                  | not captured (transient)                                                                                                                           |
| Login unverified account → `/email-confirmation`       | source only                                                                                                                                        |
| Sign-up default                                       | [desktop](./screenshots/signup--default--desktop.png) · [mobile](./screenshots/signup--default--mobile.png)                                       |
| Sign-up field errors                                  | [desktop](./screenshots/signup--field-errors--desktop.png) · [mobile](./screenshots/signup--field-errors--mobile.png)                             |
| Sign-up with an existing email                        | [desktop](./screenshots/signup--existing-email-result--desktop.png) · [mobile](./screenshots/signup--existing-email-result--mobile.png): goes to "Check your email" like a new account (see inconsistencies) |
| Google button                                         | in every auth-card shot; it does nothing yet                                                                                                       |
| Signed out, `/board` → login                          | [desktop](./screenshots/guard--board-signed-out--desktop.png)                                                                                      |

### Email confirmation `/email-confirmation`

| State                                         | Screenshots                                                                                                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| After sign-up: email prefilled, resend countdown | [desktop](./screenshots/email-confirmation--after-signup-cooldown--desktop.png) · [mobile](./screenshots/email-confirmation--after-signup-cooldown--mobile.png) |
| Direct visit: empty email, resend enabled    | [desktop](./screenshots/email-confirmation--direct-visit--desktop.png) · [mobile](./screenshots/email-confirmation--direct-visit--mobile.png)               |
| Resent ("a new link is on its way")          | [desktop](./screenshots/email-confirmation--resent--desktop.png) · [mobile](./screenshots/email-confirmation--resent--mobile.png)                           |
| Verification link error (`/email-verified?error=`) → here | [desktop](./screenshots/email-verified--error-redirect--desktop.png): the same card with no error explanation                                   |
| Rate limited / send failed (form alert)      | source only                                                                                                                                                 |

### Password reset `/reset-password`

| State                             | Screenshots                                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request link                      | [desktop](./screenshots/reset-password--request--desktop.png) · [mobile](./screenshots/reset-password--request--mobile.png)                       |
| Invalid email                     | [desktop](./screenshots/reset-password--field-error--desktop.png)                                                                                  |
| Link sent, countdown              | [desktop](./screenshots/reset-password--link-sent--desktop.png) · [mobile](./screenshots/reset-password--link-sent--mobile.png)                   |
| Token expired (`?error=`)         | [desktop](./screenshots/reset-password--token-expired--desktop.png) · [mobile](./screenshots/reset-password--token-expired--mobile.png)           |
| Change password (`?token=`)       | [desktop](./screenshots/reset-password--change--desktop.png) · [mobile](./screenshots/reset-password--change--mobile.png)                         |
| Change failed                     | [desktop](./screenshots/reset-password--change-failed--desktop.png) · [mobile](./screenshots/reset-password--change-failed--mobile.png)           |
| Change succeeded → `/login` with no message | source only                                                                                                                                |

### Auth emails

| Email                | Screenshots                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Verify your email    | [desktop](./screenshots/email--verification--desktop.png) · [mobile](./screenshots/email--verification--mobile.png)           |
| Reset your password  | [desktop](./screenshots/email--reset-password--desktop.png) · [mobile](./screenshots/email--reset-password--mobile.png)       |

### Board `/board`

Five columns in a fixed order: Inbox, year, month, week, day. Each column has an icon, a label, a count badge, and a "+" button. The board scrolls sideways.

| State                                                   | Screenshots                                                                                                                                                       |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| With todos ("Planning today")                           | [desktop](./screenshots/board--default--desktop.png) · [mobile](./screenshots/board--default--mobile.png) · [dark](./screenshots/board--default--dark--desktop.png) · [dark mobile](./screenshots/board--default--dark--mobile.png) |
| Scrolled to the day column                              | [desktop](./screenshots/board--scrolled-to-daily--desktop.png)                                                                                                     |
| Empty board                                             | [desktop](./screenshots/board--empty--desktop.png) · [mobile](./screenshots/board--empty--mobile.png) · [dark](./screenshots/board--empty--dark--desktop.png) · [dark mobile](./screenshots/board--empty--dark--mobile.png) |
| Card hover (checkbox appears)                           | [desktop](./screenshots/board--card-hover--desktop.png)                                                                                                            |
| Card completed                                          | [desktop](./screenshots/board--card-completed--desktop.png)                                                                                                        |
| Card with category stripe and tags                      | [desktop](./screenshots/board--card-with-category-and-tags--desktop.png)                                                                                           |
| Every todo in the day column done                       | [desktop](./screenshots/board--daily-all-completed--desktop.png)                                                                                                   |
| Dragging a card between columns                         | [desktop](./screenshots/board--dragging--desktop.png)                                                                                                              |
| "Planning tomorrow" (Complete day disabled, future columns tinted) | [desktop](./screenshots/board--planning-tomorrow--desktop.png) · [mobile](./screenshots/board--planning-tomorrow--mobile.png)                           |
| "Planning ahead" / "Planning earlier"                   | source only                                                                                                                                                        |
| Migration pending (board blurred behind the recap dialog) | see recap dialogs below                                                                                                                                         |
| First visit: "We are creating your board" / failed + Retry | not reachable through the harness, which opens `/board` before a journey starts (source only)                                                                    |
| New day: "Updating your board for today…" / failed + Retry | needs the real clock to cross midnight (source only)                                                                                                            |

### Toasts (sonner, bottom-right)

| Toast                                                 | Screenshots                                                                                                           |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| "Could not update Todo" (toggle failed)               | [desktop](./screenshots/toast--update-failed--desktop.png) · [mobile](./screenshots/toast--update-failed--mobile.png) |
| "Could not move Todo" (move failed)                   | [desktop](./screenshots/toast--move-failed--desktop.png) · [mobile](./screenshots/toast--move-failed--mobile.png)     |
| "Board refreshed" (stale positions)                   | source only                                                                                                           |
| Complete day / confirm migration / return-to-board failures (raw server message) | source only                                                                |

There are no success toasts anywhere.

### Todo dialog (add / edit)

| State                                   | Screenshots                                                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Add, empty                              | [desktop](./screenshots/todo-dialog--add-empty--desktop.png) · [mobile](./screenshots/todo-dialog--add-empty--mobile.png)         |
| Add, title error                        | [desktop](./screenshots/todo-dialog--add-title-error--desktop.png)                                                                 |
| Add, filled (category + tags)           | [desktop](./screenshots/todo-dialog--add-filled--desktop.png) · [mobile](./screenshots/todo-dialog--add-filled--mobile.png)       |
| Edit                                    | [desktop](./screenshots/todo-dialog--edit--desktop.png) · [mobile](./screenshots/todo-dialog--edit--mobile.png)                   |
| Edit, delete needs a second click       | [desktop](./screenshots/todo-dialog--delete-confirm--desktop.png) · [mobile](./screenshots/todo-dialog--delete-confirm--mobile.png) |
| Save / delete failed (form alert)       | source only                                                                                                                        |

### Category and tag pickers (popovers inside the todo dialog)

| State                              | Screenshots                                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Category list                      | [desktop](./screenshots/todo-dialog--category-picker--desktop.png) · [mobile](./screenshots/todo-dialog--category-picker--mobile.png)     |
| Category list, none yet            | [desktop](./screenshots/todo-dialog--category-picker-empty--desktop.png)                                                                   |
| Create category                    | [desktop](./screenshots/todo-dialog--category-create--desktop.png)                                                                         |
| Edit category                      | [desktop](./screenshots/todo-dialog--category-edit--desktop.png)                                                                           |
| Delete category, needs a second click | [desktop](./screenshots/todo-dialog--category-delete-confirm--desktop.png)                                                              |
| Tag list                           | [desktop](./screenshots/todo-dialog--tag-picker--desktop.png) · [mobile](./screenshots/todo-dialog--tag-picker--mobile.png)               |
| Tag list, two selected             | [desktop](./screenshots/todo-dialog--tag-picker-selected--desktop.png)                                                                     |
| Tag list, none yet                 | [desktop](./screenshots/todo-dialog--tag-picker-empty--desktop.png)                                                                        |
| Create tag                         | [desktop](./screenshots/todo-dialog--tag-create--desktop.png)                                                                              |
| Edit / delete tag                  | same panel as category (source only)                                                                                                       |
| Duplicate name / save failed       | source only                                                                                                                                |

### Complete-day recap dialogs

The three variants all use `BucketLifecycleRecapDialog`.

| State                                                  | Screenshots                                                                                                                                         |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Day wrapped, nothing left ("No migration needed")      | [desktop](./screenshots/recap--day-wrapped-no-migration--desktop.png) · [mobile](./screenshots/recap--day-wrapped-no-migration--mobile.png)         |
| Day wrapped on an empty day ("0 completed")            | [desktop](./screenshots/recap--day-wrapped-empty-day--desktop.png) · [mobile](./screenshots/recap--day-wrapped-empty-day--mobile.png)               |
| Migration required (after Complete day)                | [desktop](./screenshots/recap--migration-required--desktop.png) · [mobile](./screenshots/recap--migration-required--mobile.png)                     |
| Migration pending on return to the board               | [desktop](./screenshots/recap--pending-migration-on-return--desktop.png) · [mobile](./screenshots/recap--pending-migration-on-return--mobile.png)   |
| "Preparing migration" (loading) / "Migration could not load" | source only                                                                                                                                  |

### Migration `/migration`

| State                               | Screenshots                                                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Step, no choices yet                | [desktop](./screenshots/migration--step--desktop.png) · [mobile](./screenshots/migration--step--mobile.png) · [dark](./screenshots/migration--step--dark--desktop.png) · [dark mobile](./screenshots/migration--step--dark--mobile.png) |
| Step, some choices made             | [desktop](./screenshots/migration--partial-decisions--desktop.png) · [mobile](./screenshots/migration--partial-decisions--mobile.png)                               |
| Bulk "Carry all forward?" confirm   | [desktop](./screenshots/migration--bulk-carry-forward-confirm--desktop.png) · [mobile](./screenshots/migration--bulk-carry-forward-confirm--mobile.png)             |
| Bulk "Move all back?" confirm       | [desktop](./screenshots/migration--bulk-move-back-confirm--desktop.png)                                                                                              |
| Multi-step flow ("Step 2 of 3", "Up next: …") | source only (needs several buckets to end together: week or month boundary)                                                                               |
| Nothing pending                     | [desktop](./screenshots/migration--not-needed--desktop.png) · [mobile](./screenshots/migration--not-needed--mobile.png)                                             |

### Not found

| State           | Screenshots                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| Unknown path    | [desktop](./screenshots/not-found--desktop.png) · [mobile](./screenshots/not-found--mobile.png)      |

There is no route error boundary either. A failed loader shows TanStack's default error component.
