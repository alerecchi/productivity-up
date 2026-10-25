# Release manual checks

Manual checks for the human release-readiness review in [#106](https://github.com/alerecchi/productivity-up/issues/106). Automated evidence for the release candidate is in the matching `docs/release/<sha>-verification.md` record.

Run every check on staging after `pnpm deploy:staging` has deployed the revision that will go to production. `pnpm deploy:production` deploys without a prompt only when the staging version's source SHA matches `main@origin`, so test the exact revision you approve.

## Must

### Registration and onboarding

- [ ] Sign up with a real inbox. The verification email reaches that address, and its link verifies the account and signs the User in.
- [ ] The first `/board` visit shows "We are creating your board", then exactly one Inbox and the current Buckets. Reloading, or opening `/board` in two tabs at once, creates no duplicates.
- [ ] An unverified User cannot see board data but can resend verification, sign out, and reset the password. The resend action shows a 60-second countdown.

### Authentication

- [ ] Sign out, then sign in again.
- [ ] Password reset works end to end: the email arrives, the new password works, and the old one fails.
- [ ] With device A signed in, reset the password from device B. Device A loses access within five minutes.
- [ ] A password-reset request for an unknown email shows the same message as one for an existing account.

### Board

- [ ] Create, edit, toggle, and delete a Todo, including one with a Category and Tags.
- [ ] Drag a Todo within a Bucket and across Buckets. Drag repeatedly into the same gap until positions rebalance. The order survives a reload.
- [ ] Create, rename, and delete a Category and a Tag. Renames appear on Todo cards. A duplicate name shows a conflict message, not a generic error.
- [ ] Complete Day and confirm a Migration Step with incomplete Todos. Every Todo moves and the source Bucket archives together.
- [ ] Open the same Migration Step in two tabs and confirm it in both. The second tab refreshes with "another tab already resolved…".

### Realtime

Open the two windows of the same User side by side, so both stay visible, and do not click into the observing window. A window that becomes visible or gains focus runs a full resynchronization, which converges even when realtime delivery is broken. With both windows visible, only the `/api/realtime` WebSocket can explain the update.

- [ ] Run the [manual realtime convergence check](../deployment.md#manual-realtime-convergence-check), steps 1 to 6: convergence between tabs, no hints echoed to the originating tab, isolation from another User, and recovery after going offline.

### Production configuration

Staging cannot prove production-only configuration. Check it before running `pnpm deploy:production`:

- [ ] The production Worker has its own `BETTER_AUTH_SECRET` and `RESEND_API_KEY` secrets.
- [ ] The Resend domain for production's `EMAIL_FROM` is verified.

## Nice to have

- [ ] A fourth verification resend within 15 minutes returns `429`, and the UI waits for `Retry-After`. A spoofed `X-Forwarded-For` header does not reset the limit. Run this last: the limit is per IP and locks you out for 15 minutes.
- [ ] The eleventh failed sign-in within 10 minutes is throttled, and the message does not reveal whether the account exists.
- [ ] Cut the network during a drag. The optimistic move rolls back and the board repairs itself.
- [ ] Changing the User Timezone updates the Planning Date and current Buckets.
- [ ] A second real device, such as a phone, converges with the desktop.

## Only if you have time

- [ ] Touch drag-and-drop on mobile, and the main flows in Safari and Firefox.
- [ ] A tab left open for hours, or a laptop woken from sleep, resynchronizes on focus or reconnect.
- [ ] A Migration Step near the 500-decision limit completes in reasonable time.
- [ ] The #133 malformed-payload probe still exposes only the known library message.
