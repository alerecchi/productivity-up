# Authentication

Users sign in with email and password, are redirected to the board, and sign out from the user menu; unauthenticated visits to the board redirect to login. Sign-up, email verification, and password reset depend on email delivery.

Status: `auth-sign-in` proven on every `up` and `reseed` (the harness signs each seed user in through `/login` to save their sessions); everything else derived from source and not yet exercised.

## Sub-features

- `auth-sign-in` signs in and lands on `/board`.
- `auth-guard` redirects `/board` to `/login?redirect=...` when signed out.
- `auth-sign-out` signs out from the user menu.
- `auth-sign-up` creates an account and lands on `Check your email`.
- `auth-email-flows` verification and password reset links.

## How to get to it (user POV)

- `/login` (tabs `Login` / sign-up) → `Email Address`, `Password`, submit `Login`.
- Header `Open user menu` → `Logout`.
- `/signup` → `Create Account`.

## Driving it with pnpm verify drive

Preconditions: run with `--user none` to start signed out.

- **Guard.** `page.goto('/board')`. URL becomes `/login?redirect=...`.
- **Sign in.** `hydrated()`, fill `getByLabel('Email Address')` and `getByLabel('Password', { exact: true })`, click `button[type="submit"][form="login-form"]`. URL becomes `/board` and the region `Productivity Up board` is visible.
- **Sign out.** `getByRole('button', { name: 'Open user menu' }).click()`, then `getByRole('button', { name: 'Logout' })`. Visiting `/board` redirects to `/login` again.
- **Sign up.** Fill the sign-up form, submit `Create Account`. `Check your email` appears; `sql("select email, email_verified from users where email = $1", [email])` shows `false`.
- **Proof.** `sql("select count(*) from sessions s join users u on u.id = s.user_id where u.email = 'seed_user_with_data@example.com'")` before and after.

## Gotchas

- The auth page has a `Login` tab and a `Login` submit button; target the submit by `form="login-form"`.
- Every sign-in spends the 10-per-10-minutes budget for `127.0.0.1`; `reseed` clears it.
- `auth-email-flows` are unverifiable locally: no email is delivered (invalid Resend key). Report them as unverified; reading tokens from `verifications` skips the user path.
