# Inconsistencies noticed

Problems spotted while walking the app on 2026-10-19. Each one names the screenshot or source line that shows it. They are inputs for the design guide, the copy deck, and the prototypes, not bug reports. A few are real bugs, marked **(bug)**; those may be worth their own issue.

## Brand and identity

- **Three names for the product.** "ProductivityUp" in the header (`app-navigation.tsx:24`), "Productivity Up" in emails (`APP_NAME`), and "TanStack Start Starter" in the browser tab (`__root.tsx:30`). The PWA manifest, favicon and logos are still the TanStack starter's (`public/`).
- **No real logo.** The header mark is a lucide `CheckSquare` in a blue square.
- **Emails don't match the app.** Arial, a black button, and no logo or colours ([verification](./screenshots/email--verification--desktop.png)). The plain-text and HTML versions also word things differently ("opening the link below" vs "clicking the button below"; "you can ignore" vs "you can safely ignore").

## Shell and navigation

- **Placeholder home page.** `/` shows a single "Sign out" button to signed-out visitors ([home](./screenshots/home--signed-out--desktop.png)). The header logo links there, so signed-out users who click it land on a page that offers to sign them out.
- **Redundant sign-in.** On `/login` and `/signup` the header still shows a "Sign in" button next to the auth card ([login](./screenshots/login--default--desktop.png)).
- **The auth layout has no auth chrome.** Auth pages use the app header, plus two blurred blue blobs that the code marks as "TODO: Probably remove this" (`_auth-pages/route.tsx:13-18`).
- **There is no footer, no legal links, and no custom 404 or error page** ([not found](./screenshots/not-found--mobile.png) is bare "Not Found" text under the header).
- **"Board" is the only nav item.** It isn't highlighted on `/migration`, which is part of the board flow ([migration](./screenshots/migration--step--desktop.png)).
- **The user menu is a Popover, not a menu.** It has no menu roles or arrow-key navigation, "Logout" is styled destructive red, and the avatar falls back to a generic person icon ([user menu](./screenshots/user-menu--open--desktop.png)).

## Copy and tone

- **Inconsistent casing.** Title Case ("Welcome Back", "Create Account", "Email Address", "Confirm Your Password", "Add New Task", "Edit Task", "No Category") sits next to sentence case ("Check your email", "Reset your password", "Save changes", "No category", "Delete todo").
- **The same idea has different names.**
  - "Login" (tab, button) vs "Sign in" (header) vs "Logout" vs "Sign out" (home).
  - "Signup" (tab) vs "Create Account".
  - "Task" (dialog titles) vs "Todo" (everywhere else) vs "TODOs" (auth subtitles).
  - "No Category" (trigger) vs "No category" (list option).
- **Inconsistent punctuation.** Auth errors have no full stop; dialog errors do ("Title is required."). "Finishing verification..." uses three dots, while "Updating your board for today…" uses an ellipsis. "Password reset link sent!" is the only exclamation mark in the app.
- **The email placeholders differ.** "email@example.com" on login, reset and confirmation, but "name@example.com" on sign-up. The name placeholder "John Doe" is gendered and US-specific.
- **Long, blamey error messages.** "There was a problem with your login, please refresh the page and try again" and its three siblings are comma splices, and they ask the user to refresh instead of offering a retry.
- **"Your token is expired, please try again"** exposes the word "token", and it doesn't say what to do: request a new link.
- **Domain and code vocabulary leaks into the UI.**
  - Migration, carry forward, move back, bucket, bucket lifecycle, horizon, "Pending Migration Bucket", "Migration Step".
  - Glossary terms in Title Case appear mid-sentence: "This will commit the current Migration Step immediately for every incomplete Todo in…" (`migration-flow.tsx:299`) and "This is the last Pending Migration Bucket." (`migration-flow.tsx:140`).
  - "Refreshing affected Buckets now." (toast).
- **Raw keys reach users.**
  - Bucket select options read "Inbox - inbox", "Weekly - 2026-W43" and "Daily - 2026-10-19" ([dialog](./screenshots/todo-dialog--add-filled--desktop.png)), while the column headings say "Week 43 (19-25)" and "Monday 19".
  - The recap and migration screens say "Daily 2026-10-19" and "Weekly 2026-W43" ([migration](./screenshots/migration--partial-decisions--desktop.png)), and the recap heading is "2026-10-19 is wrapped" ([recap](./screenshots/recap--day-wrapped-no-migration--desktop.png)).
  - Colour swatches are announced by their raw keys ("amber", "teal").
- **Server messages are written for developers.** The client shows a server's `message` when present ("Migration Step conflict; refresh and retry", "Category not found or unauthorized"). The complete-day and migration toasts print the raw `error.message` whenever the error is an `Error`, for example a browser network error.
- **The recap copy contradicts itself.**
  - "Open the board: The board opens after this lifecycle step is resolved." shows while the board is already visible behind the dialog.
  - On a day with no todos, the recap says "0 completed" and "All todos are completed, so this step is skipped." ([empty day](./screenshots/recap--day-wrapped-empty-day--desktop.png)).
- **"Planning today / tomorrow / ahead / earlier"** is the only status text on the board, and nothing explains it. "Complete day is disabled while planning ahead." explains a disabled button but gives no way out.

## Components and visual consistency

- **Three ways to confirm a delete.**
  - Todo: the button becomes "click again" plus a red hint line.
  - Category/tag: the same, inside a popover.
  - Migration bulk actions: a real confirm dialog.
  - Nothing has undo.
- **Auth "tabs" are two `ButtonLink`s** styled as a segmented control, not shadcn `Tabs` (which is installed). In dark mode the selected tab is indistinguishable ([dark login](./screenshots/login--default--dark--desktop.png)).
- **The Bucket field is a native `<select>`** styled by hand. The Category field is a custom popover. Tags use a popover with checkboxes plus badges. These are three patterns for three pickers.
- **Selection in the category list is drawn by hand.** It uses fake radio circles (buttons with a check), and each row has two click targets that do the same thing (`todo-dialog.tsx:468-496`).
- **Colours don't match each other.**
  - Category dots are saturated, but the colour swatches in the editor are pastel ([edit category](./screenshots/todo-dialog--category-edit--desktop.png)).
  - On migration rows the category badge and left stripe are always blue, whatever the category's colour (`migration-flow.tsx:161-170`).
  - Tags render uppercase on cards and in migration, but in their own case inside the picker list.
- **Column colours are hard-coded** (`slate/violet/blue/amber/green-900` at 50% opacity, `bucket-column.tsx:182-188`). They don't use theme tokens, so the Inbox heading almost disappears in dark mode ([dark board](./screenshots/board--default--dark--desktop.png)). The same applies to the migration buttons (violet/emerald), the recap pills (emerald/amber), and the recap sun icon (sky).
- **Icons don't match.** Move back is `CornerUpLeft` per row but `ArrowDownToLine` on the bulk button. Carry forward is `FastForward` on the buttons but `ArrowRight` in the destination key (`migration-flow.tsx:193-280`).
- **Uneven type scale and spacing.** Column headings are `text-xl`, the migration heading `text-3xl`, the recap headline `text-2xl`, and the dialog title small. Cards use `m-2` inside a padded list, while columns use `gap-6` plus `p-2`.
- **The "planning" tint is subtle and unexplained.** Columns get `bg-primary/5` while planning ahead ([planning tomorrow](./screenshots/board--planning-tomorrow--desktop.png)).
- **The empty board has no empty states.** Five blank grey columns, with no hint about what buckets are or where to start ([empty board](./screenshots/board--empty--desktop.png)).
- **Completed todos simply disappear** when the day closes: they are archived ([after completing](./screenshots/board--daily-all-completed--desktop.png) → [recap](./screenshots/recap--day-wrapped-no-migration--desktop.png)). Nothing in the UI says where they went.
- **There are no success toasts or confirmations.** Error toasts exist for toggle, move, complete day and migration.

## Mobile

- **The board is the desktop layout shrunk.** Fixed 320 px columns scroll sideways, and the next column peeks at the edge ([mobile board](./screenshots/board--default--mobile.png)).
- **Touch problems.**
  - The completion checkbox is `opacity-0` until hover, so on touch it's invisible until you tap it, which is blind ([card hover](./screenshots/board--card-hover--desktop.png)).
  - The drag handle is `icon-xs`, below touch-target size.
  - Tapping a card opens edit.
- **The migration footer is fixed and takes about 140 px** on mobile, with three buttons wrapping onto two rows. On a phone the aside "N todos need a new home" sits below the list ([migration mobile](./screenshots/migration--step--mobile.png)). (In the full-page screenshot the footer appears mid-page; on a real device it stays at the bottom of the viewport.)
- **The dialogs are centred modals on mobile too**, not sheets ([add mobile](./screenshots/todo-dialog--add-empty--mobile.png)). Popovers open over the dialog and can cover its fields ([category picker mobile](./screenshots/todo-dialog--category-picker--mobile.png)).

## Accessibility

- **The completion checkbox has no accessible name.** Its id is `terms-checkbox-{id}`, a leftover (`todo-card.tsx:63-64`).
- **Drag-and-drop has no keyboard or screen-reader alternative** beyond dnd-kit's defaults. There are no custom announcements, and there is no "Move to…" action.
- **The recap dialogs use a plain `<h2>`**, not `DialogTitle`, so the dialog has no accessible name (`bucket-lifecycle-recap-dialog.tsx:56`). The todo dialog has a title but no description.
- **Icon-only buttons are inconsistent.** "Add todo" and "Show/Hide" use `aria-label`, while "Manage tags", "Edit …", "Back" and "Close" use `sr-only` spans. The column "+" says "Add todo" without naming the column, which is repeated five times.
- **"Show" / "Hide"** on the password toggle don't say what they show.
- **Dark mode contrast fails** for column headings and the migration outline buttons ([dark migration](./screenshots/migration--step--dark--desktop.png)).

## Behaviour (bugs and dead paths)

- **(bug) Opening the category or tag picker on an empty Add dialog shows "Title is required."** Focus leaves Title, and the blur validator fires ([tag picker empty](./screenshots/todo-dialog--tag-picker-empty--desktop.png)).
- **(bug) After a failed password change, the "Change password" button stays disabled** ([change failed](./screenshots/reset-password--change-failed--desktop.png)), and the alert says to refresh.
- **Signing up with an existing email** shows "Check your email" exactly like a new sign-up ([existing email](./screenshots/signup--existing-email-result--mobile.png)). That's fine for privacy, but it makes the "User already exists" / "Email already exists" messages dead code.
- **A verification-link error** (`/email-verified?error=…`) silently lands on "Check your email" with no explanation ([redirect](./screenshots/email-verified--error-redirect--desktop.png)).
- **A successful password change** navigates to `/login` with no confirmation message.
- **Login ignores `?redirect=`.** It always goes to `/board` (`login-form.tsx:58-59`, a TODO).
- **The Google button does nothing** (`social-logins.tsx:4`, a TODO).
- **The login form validates "at least 8 characters"** on an existing password.
- **`/migration` "Back to board" is a plain `<a href>`**, which forces a full page reload (`migration-route-content.tsx:32`).
