# Copy inventory

Every user-facing string in the app as of `be9022d`, with its location. **Kind** says how the string reaches the user: `visible` text, `heading`, `button`, `label`, `placeholder`, `error` (inline or alert), `toast`, `aria` (`aria-label` or `title`, heard but not seen), `sr-only` (screen-reader text), `email`, `meta`. `{…}` marks interpolated values. Paths are relative to `src/`.

Domain terms that reach users are marked **(jargon?)**. They are candidates for the user-facing vocabulary; this file doesn't judge them.

## Document and brand

| String | Kind | Location |
| --- | --- | --- |
| TanStack Start Starter | meta (`<title>`, every page) | `routes/__root.tsx:30` |
| Create TanStack App Sample / TanStack App | meta (PWA manifest name / short_name) | `public/manifest.json` (repo root) |
| ProductivityUp | visible (header logo, no space) | `features/shared/components/app-navigation/app-navigation.tsx:24` |
| Productivity Up | email (`APP_NAME`, with space) | `wrangler.jsonc:54,106` → email templates |
| Main navigation | aria | `app-navigation.tsx:16` |
| Productivity Up board | aria (board region) | `features/board/components/board.tsx:121` |

## App shell

| String | Kind | Location |
| --- | --- | --- |
| Board | visible (nav link) | `app-navigation.tsx:34` |
| Sign in | button (signed out) | `app-navigation.tsx:40` |
| Open user menu | aria | `app-navigation.tsx:80` |
| {name} / {email} / Signed in (fallback) | visible (menu header) | `app-navigation.tsx:59,90-91` |
| Logout | button | `app-navigation.tsx:105` |
| Failed to sign out. Please try again. | error | `app-navigation.tsx:66` |
| Notifications alt+T | aria (sonner region, library default) | `features/shared/components/ui/sonner.tsx` |
| Close | sr-only (every dialog's X) | `features/shared/components/ui/dialog.tsx:64` |

## Home `/`

| String | Kind | Location |
| --- | --- | --- |
| Sign out | button (shown to signed-out visitors) | `routes/index.tsx:23` |

## Auth card (login / sign-up)

| String | Kind | Location |
| --- | --- | --- |
| Welcome Back | heading (login) | `features/authentication/components/auth-container.tsx:18` |
| Create Account | heading (sign-up) | `auth-container.tsx:18` |
| Manage your TODOs effectively | visible (login subtitle) | `auth-container.tsx:20` |
| Start managing your TODOs effectively | visible (sign-up subtitle) | `auth-container.tsx:20` |
| Login / Signup | button (tab-like links) | `features/authentication/components/auth-selector.tsx:13,16` |
| Or continue with | visible (divider, rendered uppercase) | `auth-container.tsx:33` |
| Google | button | `features/authentication/components/social-logins.tsx:8` |
| Email Address | label | `login-form.tsx:87`, `sign-up-form.tsx:156`, `reset-password-request.tsx:60`, `email-confirmation.tsx:62` |
| email@example.com | placeholder (login, reset, confirmation) | `login-form.tsx:87`, `reset-password-request.tsx:60`, `email-confirmation.tsx:63` |
| name@example.com | placeholder (sign-up only) | `sign-up-form.tsx:156` |
| Name | label | `sign-up-form.tsx:146` |
| John Doe | placeholder | `sign-up-form.tsx:146` |
| Password | label | `login-form.tsx:96`, `sign-up-form.tsx:165`, `reset-password-change.tsx:65` |
| Confirm Your Password | label | `sign-up-form.tsx:175`, `reset-password-change.tsx:75` |
| •••••••• | placeholder (every password field) | `features/shared/components/form/password-input.tsx:42` |
| Forgot your password? | visible (link) | `password-input.tsx:32` |
| Show / Hide | aria + title (password toggle) | `password-input.tsx:53-54,65-66` |
| Login | button (submit) | `login-form.tsx:102` |
| Create Account | button (submit) | `sign-up-form.tsx:181` |
| Please enter a valid email address | error | `login-form.tsx:66`, `sign-up-form.tsx:119`, `reset-password-request.tsx:37`, `email-confirmation.tsx:35` |
| Password is required | error | `login-form.tsx:67`, `sign-up-form.tsx:120`, `reset-password-change.tsx:39` |
| Password must be at least 8 characters | error (also shown on **login**) | same as above |
| Name is required | error | `sign-up-form.tsx:118` |
| Passwords do not match | error | `sign-up-form.tsx:124`, `reset-password-change.tsx:43` |
| Invalid Email or Password | error (alert) | `login-form.tsx:43` |
| There was a problem with your login, please refresh the page and try again | error (alert) | `login-form.tsx:52` |
| User already exists | error (field; unreachable in practice, see inconsistencies) | `sign-up-form.tsx:33` |
| Email already exists | error (field) | `sign-up-form.tsx:37` |
| Password is too long / Password is too short | error (field) | `sign-up-form.tsx:41,45` |
| There was a problem with your account creation, please refresh the page and try again | error (alert) | `sign-up-form.tsx:102` |
| Unknown error occurred | error (fallback) | `features/shared/utils/form.ts:15` |

## Email confirmation `/email-confirmation` and `/email-verified`

| String | Kind | Location |
| --- | --- | --- |
| Check your email | heading | `email-confirmation.tsx:40` |
| If your account needs verification, check your inbox for a confirmation link. If it doesn't arrive within a few minutes, check your spam folder or request another one below. | visible | `email-confirmation.tsx:42-43` |
| Resend verification email | button | `email-confirmation.tsx:82` |
| Resend in {m:ss} | button (countdown) | `email-confirmation.tsx:81` |
| If this account needs verification, a new link is on its way. | visible (after resend) | `email-confirmation.tsx:74` |
| Too many requests. Please wait before requesting another email. | error (alert) | `features/authentication/lib/auth-email-requests.ts:70` |
| We could not send the email. Please try again. | error (alert) | `auth-email-requests.ts:73` |
| Finishing verification... | visible (spinner, three dots not `…`) | `routes/_auth-pages/email-verified.tsx:19` |

## Password reset `/reset-password`

| String | Kind | Location |
| --- | --- | --- |
| Reset your password | heading | `reset-password-container.tsx:80` |
| Enter your account's verified email address and we will send you a password reset link. | visible | `reset-password-container.tsx:81` |
| Send password reset link | button | `reset-password-request.tsx:71` |
| Send password reset link in {m:ss} | button (countdown) | `reset-password-request.tsx:70` |
| Your token is expired, please try again | error (alert) | `reset-password-request.tsx:40` |
| Password reset link sent! | heading | `reset-password-container.tsx:92` |
| If this email exists in our system, check your email for the reset link. If it doesn't appear within a few minutes, check your spam folder. | visible | `reset-password-container.tsx:94` |
| Send another link / Send another link in {m:ss} | button | `reset-password-request-again.tsx:48-49` |
| Use a different email | button | `reset-password-request-again.tsx:56` |
| Change your password | heading | `reset-password-container.tsx:99` |
| Please enter your new password to regain access to your account | visible (no full stop) | `reset-password-container.tsx:100` |
| Change password | button | `reset-password-change.tsx:81` |
| There was a problem with changing your password, please refresh the page and try again | error (alert) | `reset-password-change.tsx:27` |

## Auth emails

`{appName}` = "Productivity Up". Plain-text and HTML versions differ slightly.

| String | Kind | Location |
| --- | --- | --- |
| Verify your email for {appName} | email subject | `server/email/templates/email-verification.ts:13` |
| Verify your email | email heading | `email-verification.ts:29` |
| Hi {userName}, / Hi, | email | `email-verification.ts:12`, `reset-password.ts:8` |
| Thanks for signing up for {appName}. | email | `email-verification.ts:18,35` |
| Please verify your email address by opening the link below: | email (text) | `email-verification.ts:19` |
| Please confirm your email address by clicking the button below: | email (HTML) | `email-verification.ts:39` |
| Verify email | email button | `email-verification.ts:47` |
| Or copy and paste this URL into your browser: | email | `email-verification.ts:52`, `reset-password.ts:49` |
| If you did not create an account, you can ignore this email. / …you can safely ignore this email. | email (text / HTML) | `email-verification.ts:23,62` |
| Reset your password for {appName} | email subject | `server/email/templates/reset-password.ts:9` |
| Reset your password | email heading | `reset-password.ts:25` |
| We received a request to reset your password for {appName}. | email | `reset-password.ts:14,31-32` |
| Open the link below to choose a new password: | email (text) | `reset-password.ts:15` |
| Click the button below to choose a new password: | email (HTML) | `reset-password.ts:36` |
| Reset password | email button | `reset-password.ts:44` |
| If you did not request this, you can ignore this email. / If you did not request a password reset, you can safely ignore this email. | email (text / HTML) | `reset-password.ts:19,59-60` |

## Board `/board`

| String | Kind | Location |
| --- | --- | --- |
| Planning today / Planning tomorrow / Planning ahead / Planning earlier **(jargon?)** | visible (board header) | `features/board/components/board.tsx:90-93` |
| Complete day is disabled while planning ahead. | visible + sr-only | `board.tsx:102,115` |
| Complete day | button | `board.tsx:111` |
| Could not complete day | toast (fallback when the error isn't an `Error`; otherwise its raw `message` is shown) | `board.tsx:50` |
| Inbox | heading (column) | `lib/periods.ts:57` |
| {year}, e.g. 2026 | heading (column) | `lib/periods.ts:61` |
| {month name}, e.g. October | heading (column) | `lib/periods.ts:66` |
| Week {n} ({d}-{d}) / Week {n} ({d} {Mon}-{d} {Mon}), e.g. Week 43 (19-25) | heading (column) | `lib/periods.ts:83` |
| {weekday} {d}, e.g. Monday 19 | heading (column) | `lib/periods.ts:71` |
| {count} | visible (column badge) | `bucket-column.tsx:51` |
| Add todo | aria ("+" button) | `create-todo-button.tsx:19` |
| {label} Todos | aria (column list) | `bucket-column.tsx:55` |
| Drag {title} | aria (card handle) | `todo-card.tsx:54` |
| (none) | the completion checkbox has no accessible name | `todo-card.tsx:63` |
| We are creating your board | visible (first visit) | `board-initialization-status.tsx:24` |
| We could not create your board. Please try again. | error | `board-initialization-status.tsx:16` |
| Updating your board for today… | visible (new day) | `lifecycle-reconciliation-status.tsx:21` |
| Your board could not be updated for today. | error | `lifecycle-reconciliation-status.tsx:15` |
| Retry | button | `board-initialization-status.tsx:18`, `lifecycle-reconciliation-status.tsx:16` |

## Toasts

| String | Kind | Location |
| --- | --- | --- |
| Could not update Todo — Your change was undone. Please try again. | toast | `features/board/hooks/use-update-todo.ts:49` |
| Could not move Todo — Your board was restored. Refreshing affected Buckets now. **(jargon?)** | toast | `features/board/hooks/use-move-todo.ts:41-42` |
| Board refreshed — Todo positions changed before your move completed. Review the latest order and try again. | toast | `use-move-todo.ts:35-36` |
| Could not confirm migration **(jargon?)** | toast (fallback) | `migration-flow.tsx:73` |
| Could not return to the board | toast (fallback) | `migration-flow.tsx:94` |

## Todo dialog

| String | Kind | Location |
| --- | --- | --- |
| Add New Task / Edit Task | heading | `features/board/components/todo-dialog.tsx:783` |
| Title | label | `todo-dialog.tsx:795` |
| Description | label | `todo-dialog.tsx:819` |
| Bucket **(jargon?)** | label | `todo-dialog.tsx:842` |
| Select bucket | visible (empty option) | `todo-dialog.tsx:857` |
| Inbox - inbox / Yearly - 2026 / Monthly - 2026-10 / Weekly - 2026-W43 / Daily - 2026-10-19 | visible (bucket options: type label + raw period key) | `todo-dialog-utils.ts:43-49,71` |
| Category | label | `todo-dialog.tsx:881` |
| No Category | button (category trigger) | `todo-dialog.tsx:898` |
| Tags | label | `todo-dialog.tsx:915` |
| Manage tags | sr-only ("+" button) | `todo-dialog.tsx:927` |
| Remove {tag} | aria (badge ×) | `todo-dialog.tsx:941`, `todo-resource-picker.tsx:338` |
| Add | button (create) | `todo-dialog.tsx:981` |
| Save changes | button (edit) | `todo-dialog.tsx:981` |
| Delete todo | button | `todo-dialog.tsx:972` |
| Click Delete todo again to permanently delete it. | error-styled hint | `todo-dialog.tsx:959` |
| Title is required. | error (full stop, unlike the auth errors) | `todo-dialog-utils.ts:40` |
| Bucket is required. | error | `todo-dialog-utils.ts:41` |
| Could not save the todo. | error (alert, fallback) | `todo-dialog.tsx:117` |
| Could not delete the todo. | error (fallback) | `todo-dialog.tsx:386` |

## Category and tag pickers

| String | Kind | Location |
| --- | --- | --- |
| Categories / Tags | heading (popover) | `todo-dialog.tsx:411,613` |
| Search categories / Search tags | placeholder + aria | `todo-dialog.tsx:413,614` → `todo-resource-picker.tsx:86,89` |
| No category | visible (list option, lower-case c) | `todo-dialog.tsx:455` |
| No tags | visible (empty list) | `todo-dialog.tsx:635` |
| Select {category} | aria (radio-like button) | `todo-dialog.tsx:479` |
| {tag} | aria (tag checkbox label) | `todo-dialog.tsx:652` |
| Edit {category} / Edit {tag} | sr-only (pencil) | `todo-dialog.tsx:513,682` |
| Create category / Create tag | button + panel heading | `todo-dialog.tsx:429,544,629,714` |
| Edit category / Edit tag | heading (panel) | `todo-dialog.tsx:583,761` |
| Name | label + aria | `todo-resource-picker.tsx:239-240` |
| Color | label | `todo-resource-picker.tsx:243` |
| red, orange, amber, yellow, lime, green, teal, blue, violet, rose | aria (swatches, raw keys) | `todo-resource-picker.tsx:294`, `lib/types/Color.ts:3-14` |
| Back | sr-only | `todo-resource-picker.tsx:233` |
| Close | sr-only | `todo-resource-picker.tsx:63` |
| Delete / Save | button | `todo-resource-picker.tsx:268,272` |
| Click Delete again to permanently delete this category. / …this tag. | error-styled hint | `todo-dialog.tsx:552,721` |
| A category with this name already exists. / A tag with this name already exists. | error | `todo-dialog.tsx:160,200,315` |
| Could not create / save / delete the category. | error (fallbacks) | `todo-dialog.tsx:177,331,359` |
| Could not create / save / delete the tag. | error (fallbacks) | `todo-dialog.tsx:215,262,296` |

## Complete-day recap dialogs

| String | Kind | Location |
| --- | --- | --- |
| {YYYY-MM-DD} is wrapped | heading (raw ISO date) | `board.tsx:151` |
| Migration required **(jargon?)** | heading | `pending-migration-recap-dialog.tsx:38` |
| Migration could not load **(jargon?)** | heading | `pending-migration-recap-dialog.tsx:69` |
| Review the bucket lifecycle before moving on. **(jargon?)** | visible | `bucket-lifecycle-recap-dialog.tsx:58` |
| Review ended buckets **(jargon?)** | visible (step) | `bucket-lifecycle-recap-dialog.tsx:66` |
| Capture the close of each bucket before choosing what happens next. | visible (step) | `bucket-lifecycle-recap-dialog.tsx:67` |
| {n} completed / {n} incomplete | visible (pills) | `bucket-lifecycle-recap-dialog.tsx:144,149` |
| No migration needed **(jargon?)** | visible (step) | `board.tsx:154` |
| All todos are completed, so this step is skipped. | visible (step; also shown when the day was empty) | `board.tsx:153` |
| Migrate unfinished todos **(jargon?)** | visible (step) | `pending-migration-recap-dialog.tsx:45` |
| Pick carry forward or move back for each unfinished todo. **(jargon?)** | visible (step) | `pending-migration-recap-dialog.tsx:43` |
| Preparing migration / Loading unfinished todos before migration. | visible (loading step) | `pending-migration-recap-dialog.tsx:42,45` |
| Migration unavailable / Try loading the unfinished todos again before continuing. | visible (error step) | `pending-migration-recap-dialog.tsx:71-72` |
| Open the board | visible (step) | `bucket-lifecycle-recap-dialog.tsx:79` |
| The board opens after this lifecycle step is resolved. **(jargon?)** | visible (step) | `bucket-lifecycle-recap-dialog.tsx:80` |
| Inbox / {Type} {period key}, e.g. Daily 2026-10-19 | visible (breakdown row) | `bucket-lifecycle-recap-dialog.tsx:156-161` |
| {n} completed, {n} incomplete | visible (breakdown row) | `bucket-lifecycle-recap-dialog.tsx:90` |
| Close and plan tomorrow | button | `board.tsx:150` |
| Continue to migration **(jargon?)** | button | `pending-migration-recap-dialog.tsx:35` |
| Retry migration | button | `pending-migration-recap-dialog.tsx:67` |

## Migration `/migration`

| String | Kind | Location |
| --- | --- | --- |
| {Type} migration / Inbox migration, e.g. DAILY MIGRATION **(jargon?)** | visible (eyebrow, uppercase) | `migration-flow.tsx:333-339` |
| Step {i} of {n} | visible | `migration-flow.tsx:129` |
| Decide what moves on from {Type} {period key}. | heading | `migration-flow.tsx:133` |
| This bucket has reached its end. Keep the work at the same horizon, or return it to a broader bucket for another pass. **(jargon?)** | visible | `migration-flow.tsx:136-137` |
| Up next: {bucket names} | visible | `migration-flow.tsx:140` |
| This is the last Pending Migration Bucket. **(jargon?, glossary term in Title Case)** | visible | `migration-flow.tsx:140` |
| Place unfinished work | heading | `migration-flow.tsx:148` |
| Each row has one deliberate destination. | visible | `migration-flow.tsx:149` |
| Move back **(jargon?)** | button (per row) + key label | `migration-flow.tsx:194,226` |
| Carry forward **(jargon?)** | button (per row) + key label | `migration-flow.tsx:209,232` |
| {n} todo(s) need(s) a new home | heading (aside) | `migration-flow.tsx:222`, `formatTodoCount` `:341-343` |
| {Type} {period key}, e.g. Weekly 2026-W43 | visible (destination) | `migration-flow.tsx:227,233` |
| The current bucket closes after every todo has a destination. | visible | `migration-flow.tsx:237` |
| {decided}/{total} | visible (progress) | `migration-flow.tsx:374` |
| Move all back / Carry all forward | button (footer) | `migration-flow.tsx:264,281` |
| Confirm choices | button | `migration-flow.tsx:288` |
| Move all back? / Carry all forward? | heading (confirm dialog) | `migration-flow.tsx:256,273` |
| This will commit the current Migration Step immediately for every incomplete Todo in {Type} {period key}. **(jargon?, glossary terms in Title Case)** | visible (confirm dialog) | `migration-flow.tsx:299-300` |
| Cancel | button | `migration-flow.tsx:305` |
| Confirm move all back / Confirm carry all forward | button | `migration-flow.tsx:254,271` |
| Choose a destination for every Todo | error (thrown; would surface as a toast) | `migration-flow.tsx:394` |
| No migration needed | heading | `migration-route-content.tsx:30` |
| Your board has no pending bucket migrations. **(jargon?)** | visible | `migration-route-content.tsx:31` |
| Back to board | button (link) | `migration-route-content.tsx:34` |

## Server messages that can reach the UI

The client shows a server's `message` field instead of its own fallback whenever one is present (`features/shared/utils/operation-error.ts:32`). Complete-day and migration toasts also show the raw `error.message` whenever the error is an `Error`. So these strings are user-facing:

| String | Location |
| --- | --- |
| Todo positions changed; refresh and try again | `lib/todo-error-messages.ts:1` (matched by the client to show "Board refreshed") |
| Migration is required before changing {Todos/Tags/Categories} | `server/core/pending-migration-gate.ts:13` |
| Pending Migration Bucket not found | `server/functions/board/operations.ts:101,199` |
| Migration Step conflict; refresh and retry | `server/functions/board/operations.ts:105` |
| Todos in archived Buckets cannot change | `server/functions/todos/operations.ts:267` |
| Cannot complete a future Bucket | `server/functions/board/lifecycle.ts:243` |
| The board changed; refresh and try again | `server/functions/board/lifecycle.ts:342` |
| Timezone is required to reconcile this board | `server/functions/board/lifecycle.ts:194` |
| Category not found or unauthorized / Tag not found or unauthorized | `server/functions/categories/operations.ts:87,98`, `server/functions/tags/operations.ts:83,94` |
| Resource not found / Request conflict / Invalid request / Too many requests / Request validation failed | `server/core/errors.ts:56,140,148,165-168` |
| Authentication is required / Email verification is required / Origin is not allowed | `server/core/errors.ts:32,36,40` |
| Not Found | TanStack Router default 404 (no custom component) |
