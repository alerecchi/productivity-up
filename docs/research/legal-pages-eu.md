# Legal pages for an EU-based, free todo app with Google sign-in

Research date: 2026-10-18. Ticket: #141 (map #137).

> **Not legal advice.** This note maps primary sources onto the current codebase so the owner can brief a lawyer or write the pages with eyes open. Points marked **Uncertain** depend on how the law is interpreted or on facts only the owner has. Italian law is assumed wherever member-state law matters.

## Decision summary

- **Required pages:** a **Privacy Policy** (GDPR Arts. 12-13) that also contains the cookie notice, and **Terms of Service**. Google requires both links for an external production OAuth app. A short **Legal notice / Contact** section is cheap insurance; it is only strictly required if the app counts as an "information society service" (see below). It can live inside the Terms or the footer.
- **Cookie banner: no**, for the current cookie set. Every cookie and storage item is first-party and serves authentication, security or the user's own flow. That falls under the ePrivacy Art. 5(3) "strictly necessary" exemption, which the Italian Garante confirms needs only an information notice and no banner. **One caveat:** Better Auth's session cookie persists for 7 days by default, and the WP29 says persistent login cookies are _not_ exempt. The cheap fix is a "Keep me signed in" checkbox (Better Auth `rememberMe`), unchecked by default.
- **Banner trigger:** adding non-essential analytics, product analytics, session replay, ads or third-party embeds would require a consent banner before those tools run.
- **Where links go:** in a site-wide footer on public pages, at the signup form (both email and Google), on the homepage (Google requires the privacy link there), and in the Google Cloud OAuth Branding page.
- **What only the owner can supply:** controller identity and contact details, the Neon region, whether to sign the vendor DPAs, retention periods and minimum age. See the checklist at the end.

## What the app actually does today (from the codebase)

### Processors and other recipients

| Party                                                                                     | Role                                                                              | Personal data                                                                                                                                                                                                                                                                                      | Where established / transfer basis                                                                                                                                                                                              | Code evidence                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cloudflare** (Workers, Durable Objects, Hyperdrive, DNS/proxy, Workers Logs and Traces) | Processor (hosting, CDN, realtime, logs)                                          | All request traffic, including IP addresses and user agents. Realtime state per user (Durable Object `USER_REALTIME`). Logs and traces are enabled in staging and production, with query strings redacted.                                                                                         | US company. The DPA relies on the EU-US Data Privacy Framework and falls back to SCCs Module 2 ([Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/) §6)                                                       | `wrangler.jsonc` (`observability`, `hyperdrive`, `durable_objects`, custom domain `productivity-up.com`)                                                                        |
| **Neon** (Postgres, now a Databricks company)                                             | Processor (database)                                                              | Account (`users`: name, email, email-verified flag, image URL, time zone), `sessions` (token, **IP address, user agent**, expiry), `accounts` (password hash; OAuth tokens once Google is wired), `verifications`, `auth_rate_limits` (keyed per IP + path), and all todos, buckets and categories | Depends on the project region the owner chose. **Owner must confirm.** The Neon DPA page now shows a Databricks schedule ([neon.com/dpa](https://neon.com/dpa)), so the transfer terms need checking against the Databricks DPA | `src/server/db/schema/auth-schema.ts`, `src/server/auth/rate-limit.ts`                                                                                                          |
| **Resend** (Plus Five Five, Inc.)                                                         | Processor (transactional email)                                                   | Recipient email, name, verification and reset links                                                                                                                                                                                                                                                | US. The DPA says primary processing is in the US and relies on the DPF plus SCCs ([Resend DPA](https://resend.com/legal/dpa) §§6.1, 6.2, 11.1)                                                                                  | `src/server/email/`, `RESEND_API_KEY`, `EMAIL_FROM`                                                                                                                             |
| **Google** (Sign in with Google)                                                          | **Independent controller** for its own sign-in; the app receives data from Google | Name, email, profile picture URL, Google account ID, ID and access tokens (stored in `accounts`)                                                                                                                                                                                                   | Not a processor of the app, but it must be disclosed as a source of data                                                                                                                                                        | `src/features/authentication/components/social-logins.tsx`. **Today this is a placeholder button.** `socialProviders` is not yet configured in `src/server/auth/create-auth.ts` |

There is no analytics, no error-tracking SaaS, no ads, no third-party fonts (Manrope is self-hosted through `@fontsource-variable/manrope`) and no third-party scripts.

**Watch item: avatar hotlinking.** `app-navigation.tsx` renders `<img src={user.image} referrerPolicy='no-referrer'>`. Once Google sign-in is wired, `user.image` will be a Google-hosted URL, so every page view will send the visitor's IP address to Google. A German court held that embedding Google Fonts this way, without consent, breached GDPR (LG München I, 3 O 17493/20, 20 Jan 2022). That ruling is not binding in Italy. **Uncertain** how an Italian court would treat it. Safest options: (a) proxy or copy the avatar to first-party storage, (b) show initials only, or (c) at least disclose the request in the Privacy Policy.

### Cookies and browser storage

Better Auth 1.7.7 names are taken from `node_modules/better-auth/dist/cookies/index.mjs` and `state.mjs`. On HTTPS every name gets the `__Secure-` prefix. All of these cookies are first-party, `HttpOnly`, `SameSite=Lax` and `Path=/`.

| Name                                                       | Purpose                                                                   | Lifetime                                             | When set                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| `__Secure-better-auth.session_token`                       | Signed session token (authentication)                                     | **7 days** (default `session.expiresIn`; persistent) | On sign-in                                                  |
| `__Secure-better-auth.session_data`                        | Session cookie cache (`session.cookieCache`, enabled in `create-auth.ts`) | 5 minutes                                            | On sign-in and session refresh                              |
| `__Secure-better-auth.dont_remember`                       | Marks a "don't remember me" sign-in                                       | Browser session                                      | Only when sign-in uses `rememberMe: false` (not used today) |
| `__Secure-better-auth.state`                               | OAuth CSRF state (signed), with the state itself stored in the DB         | 5 minutes                                            | Once Google sign-in is wired                                |
| `__Secure-better-auth.account_data`                        | Account cookie cache                                                      | 5 minutes                                            | Only if `account.storeAccountCookie` is enabled (not today) |
| `sessionStorage['productivity-up:migration-flow-started']` | Remembers which buckets the user's in-progress migration flow covers      | Tab session                                          | During the migration flow                                   |

Google's own cookies are set on `accounts.google.com` during the OAuth redirect. They are Google's responsibility as an independent controller, not the app's.

## 1. Cookie / ePrivacy rules and the banner question

- **Rule.** ePrivacy Directive 2002/58/EC Art. 5(3) requires consent to store or read information on a user's device. The exception is storage that is "strictly necessary in order for the provider of an information society service explicitly requested by the subscriber or user to provide the service" ([EUR-Lex](https://eur-lex.europa.eu/eli/dir/2002/58/2009-12-19)). Italy implements this in Codice privacy (D.Lgs. 196/2003) Art. 122.
- **The rule covers more than cookies.** EDPB Guidelines 2/2023 v2.0 (16 Oct 2024) list "cookies, local storage, WebSQL" as information stored on the device, and the rule applies once that information is accessed or leaves the device ([EDPB](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-22023-technical-scope-art-53-eprivacy-directive_en)). The `sessionStorage` key above therefore falls in scope. It is still strictly necessary for a flow the user started.
- **Authentication cookies are exempt.** WP29 Opinion 04/2012 (WP194) §3.2 says authentication cookies are "exempted under CRITERION B". §3.3 extends the exemption to security cookies that "detect repeated failed login attempts".
- **But persistent login cookies are not exempt.** WP194 §3.2: "Persistent login cookies which store an authentication token across browser sessions are not exempted under CRITERION B… a checkbox and a simple information note such as 'remember me (uses cookies)' next to the submit form would be an appropriate means of gaining consent." Its summary table limits the authentication-cookie exemption to "the duration of a session".
  - **Uncertain:** how strictly the Garante applies this to a 7-day session token today. WP194 is non-binding, and many sites rely on persistent login cookies without consent.
  - **Recommendation:** add a "Keep me signed in" checkbox to the email login form, unchecked by default. It maps directly to Better Auth's `signIn.email({ rememberMe })`, which issues a browser-session cookie when false.
  - For Google sign-in there is no form to put the checkbox on. Either use the same checkbox on the auth screen before redirecting (Better Auth's social sign-in accepts the same option; **verify before implementing**) or accept the residual risk.
- **Italian Garante position.** In the cookie guidelines of 10 June 2021 ([doc. web 9677876](https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/9677876)), technical cookies need no consent: "il titolare del trattamento sarà assoggettato al solo obbligo di fornire specifica informativa". No banner is needed either: "senza l'esigenza di apporre specifici banner". The notice can be included in the general privacy notice ("anche eventualmente inserita all'interno di quella di carattere generale").
- **Conclusion:** no banner. Add a "Cookies and local storage" section to the Privacy Policy that lists the table above (name, purpose, duration, first-party).
- **What would change this:** any analytics (even Cloudflare Web Analytics' JS beacon should be assessed; the Garante allows consent-free analytics only under strict conditions such as IP masking and no cross-referencing), PostHog, Sentry browser SDK with session replay, embedded videos, or Google-hosted avatars loaded by the browser (that is a third-party request rather than a cookie, but the same disclosure logic applies).

## 2. Privacy Policy (required)

**Legal basis.** GDPR Art. 13 applies whenever personal data is collected from the data subject. Art. 14 applies to data obtained from Google. Art. 12 requires "concise, transparent, intelligible and easily accessible form, using clear and plain language" ([GDPR on EUR-Lex](https://eur-lex.europa.eu/eli/reg/2016/679/oj)).

Google also requires a privacy policy that "fully documents how your application interacts with user data", including how it "accesses, uses, stores, or shares Google user data". It must be linked in the OAuth client configuration and must be "prominently displayed in your application interface" ([Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)).

**Required content (Art. 13(1)-(2)), mapped to this app:**

1. **Controller identity and contact details:** owner's name or business name, postal address and email. _Owner fact._
2. **DPO contact:** not applicable. Art. 37 requires a DPO only for public bodies or core activities involving large-scale monitoring or special categories. State "no DPO appointed" or omit.
3. **Purposes and legal basis for each purpose:**
   - Account and todo storage, sign-in, sync and realtime: **Art. 6(1)(b)**, necessary for the contract (the Terms).
   - Verification and password-reset emails: **6(1)(b)**.
   - Security (rate limiting by IP, session IP and user agent, server logs and traces): **6(1)(f)**, legitimate interest in securing the service. Name the interest.
   - Any legal obligations: **6(1)(c)**.
4. **Legitimate interests pursued**, where 6(1)(f) is used: see above.
5. **Recipients or categories of recipients:** Cloudflare, Neon, Resend, and Google (as source of sign-in data). Naming them is best practice.
6. **International transfers and safeguards:** Cloudflare and Resend are US-based; both rely on EU-US DPF and SCCs. Neon depends on region. Say how users can obtain a copy of the safeguards.
7. **Retention periods** or the criteria used for them:
   - Account data until deletion.
   - Sessions: 7 days.
   - Verification tokens until expiry.
   - Rate-limit rows: their window. **Check whether old rows are pruned.**
   - Cloudflare logs: 3 days (Free) or 7 days (Paid), per the [Workers Logs docs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/).
   - Resend email logs: per Resend's retention. **Owner to confirm.**
   - _Owner fact for the final numbers._
8. **Rights:** access, rectification, erasure, restriction, portability (Arts. 15-20), objection to 6(1)(f) processing (Art. 21), and how to exercise them. **Note:** there is no in-app account deletion or export today. Rights can be honoured by email, but self-serve deletion is worth a future ticket.
9. **Right to complain to a supervisory authority:** for Italy, the Garante per la protezione dei dati personali (garanteprivacy.it).
10. **Whether providing data is a contractual requirement** and the consequences of not providing it: an email is needed to have an account.
11. **Automated decision-making / profiling:** none. Say so.
12. **Art. 14 extras for Google data:** categories obtained (name, email, profile picture, Google ID) and the source (Google).
13. **Cookie and storage notice:** the table above (Garante 2021 guidelines §8).
14. **Google-specific statement:** list the Google data accessed (basic `openid email profile` scopes), its use (account creation and sign-in only) and that it is not sold or shared. Add a sentence on the profile-picture handling chosen above. Limited Use rules apply only to sensitive and restricted scopes ([User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)), so they do not apply here.
15. **Version date and change process:** Google requires users to be notified, and to consent, before any new use of Google data.

**Language: Uncertain.** GDPR does not mandate a language, but Art. 12 "intelligible" is generally read as the audience's language. If Italian users are targeted, an Italian version is prudent.

**Internal, not a page:** a record of processing activities (Art. 30). The <250-employee exemption in Art. 30(5) does not apply when processing is "not occasional", which continuous account storage is. Also keep signed or accepted DPAs with Cloudflare, Neon and Resend (Art. 28(3)). **Uncertain:** whether each vendor's DPA attaches automatically to a self-serve or free plan. The Cloudflare page does not say how self-serve customers accept it.

## 3. Terms of Service (required in practice)

- **EU law:** no statute says "you must publish terms" for a free app. But the GDPR basis 6(1)(b) above _needs_ a contract to point to, so the Terms are what that basis rests on.
- **Google:** App domain links (home page, privacy policy, terms of service) "are required for all external production apps. You will not be able to submit your app for verification if it is missing these links." ([OAuth Branding](https://support.google.com/cloud/answer/15549049))
- **Digital Content Directive (EU) 2019/770:** applies when the consumer "provides or undertakes to provide personal data", _unless_ the data is processed "exclusively" for supplying the service or for legal obligations (Art. 3(1)). Italy transposes this in Codice del Consumo Arts. 135-octies et seq.
  - **Uncertain, leaning "out of scope":** today all data is used only to provide the service. Any analytics or marketing use would bring the app into scope, with its conformity and remedy rules.
- **Digital Services Act (EU) 2022/2065:** cloud storage of user-provided content is a "hosting service" (Art. 3(g)(iii)). Hosting obligations that apply even to micro-enterprises:
  - points of contact for authorities and users (Arts. 11-12);
  - content restrictions stated in the T&Cs (Art. 14);
  - notice-and-action (Art. 16);
  - statements of reason (Art. 17).

  The micro/small exemptions cover the online-platform duties and transparency reports, not these.
  - **Uncertain:** whether a free, non-commercial app is an "information society service" at all. The definition says "normally provided for remuneration" (Directive (EU) 2015/1535 Art. 1(1)(b)). The CJEU accepts that remuneration need not come from the user (C-291/13 _Papasavvas_). A truly no-revenue hobby app may fall outside, but that is not settled.
  - The cheap way to cover it: a contact email in the Terms, a short acceptable-use clause, and a sentence on how to report illegal content. Todos are private, so this will rarely be used.

- **Recommended content:**
  - who provides the service (same identity as the controller);
  - eligibility and minimum age (see below);
  - account rules (one person, keep credentials safe);
  - acceptable use (no illegal content, no abuse of the service, no automated scraping);
  - the service is free, with no guarantee of availability and "as is" within consumer-law limits;
  - user owns their content and grants only the licence needed to host it;
  - suspension and termination, and account deletion by the user;
  - changes to the Terms with notice;
  - governing law and court.

  **Note:** for EU consumers, Rome I Art. 6 and Brussels I bis Art. 18 keep the consumer's home-country protections and courts regardless of the clause. Also state the contact email and include a link to the Privacy Policy.

- **Minimum age.** GDPR Art. 8 sets the age of digital consent for consent-based processing. Italy sets it at **14** (Codice privacy Art. 2-quinquies). This app relies on contract rather than consent, so Art. 8 does not strictly bite.
  - **Uncertain:** whether a minor can validly enter the contract under Italian civil law (age of majority is 18, Codice civile Art. 2).
  - The simplest safe choice: Terms state a minimum age of 14 (or 16 if launching EU-wide, to match the strictest member states).
- **Unfair terms:** Directive 93/13/EEC (Codice del Consumo Arts. 33-38) voids terms that cause significant imbalance against consumers. Blanket liability exclusions for gross negligence or death are void in Italy (Codice civile Art. 1229).

## 4. Imprint / Legal notice

- **E-Commerce Directive 2000/31/EC Art. 5** requires an information society service provider to give "easily, directly and permanently accessible" information: name, geographic address, email, trade register and VAT number if any. Italy implements this in D.Lgs. 70/2003 Art. 7.
- **The same remuneration question as the DSA applies (Uncertain).** If the owner runs it as a business (P.IVA), Italian rules also require the VAT number on the website (DPR 633/1972 Art. 35).
- **Germany's stricter Impressum rule** (DDG §5) binds providers established in Germany. It does not bind an Italian provider (country-of-origin principle, Directive Art. 3).
- **Recommendation:** add a "Legal notice" or "Contact" block (in the footer or in the Terms) with the provider's name, a postal address and an email. The Privacy Policy already needs the same identity. **Owner decision:** whether to publish a home address. A business or PO-box-style address is common.

## 5. Accessibility statement

Not required. The European Accessibility Act (Directive (EU) 2019/882, Italy D.Lgs. 82/2022) covers only a listed set of services (Art. 2(2), e.g. e-commerce, banking, e-books, transport), which a free todo app is not, and it exempts **microenterprises providing services** anyway (Art. 4(5)). Not a page to build now.

## 6. Google OAuth requirements (for when Google sign-in is wired)

From the [Branding page help](https://support.google.com/cloud/answer/15549049), [brand verification requirements](https://support.google.com/cloud/answer/13464321), [verification exceptions](https://support.google.com/cloud/answer/13464323) and the [User Data Policy](https://developers.google.com/terms/api-services-user-data-policy):

- **Scopes.** The app needs only `openid email profile`, which are non-sensitive. Full app verification "is not mandatory" for non-sensitive scopes.
- **Brand verification** is needed to show the app name and logo on the consent screen. Without it, "only your application domain will be visible to users". Requirements:
  - the homepage is on a verified domain the owner owns (`productivity-up.com`, verified via Google Search Console);
  - the homepage identifies the app and describes its functionality, and **cannot be only a login page**;
  - the homepage links to the Privacy Policy;
  - the Privacy Policy is on the same domain as the homepage and is the **same** URL as on the consent screen;
  - all authorized domains are verified.
- **Branding page fields:** app name, user support email (required, shown on the consent screen), logo (square, 120x120 px recommended, <1MB), home page / privacy / terms links (required for external production apps), authorized domains, developer contact.
- **Impact on the codebase:** `src/routes/index.tsx` is currently a bare "Sign out" button with a redirect for signed-in users. It does **not** meet the homepage requirement. The public landing page in map #137 is therefore a prerequisite for Google brand verification.
- **Testing mode:** apps in testing mode are capped at 100 users and show the unverified-app screen.
- **Sign-in button:** follow Google's Sign-In branding guidelines. Google recommends them for apps requesting only profile/email scopes.

## 7. Where links must appear

| Location                                          | Links                                                                                 | Why                                                                                                                                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Public homepage / landing**                     | Privacy Policy (required), Terms, Legal notice/Contact                                | Google brand verification. Art. 12 "easily accessible". E-Commerce Art. 5 "permanently accessible".                                                                                                   |
| **Site-wide footer** (public and signed-in shell) | Privacy, Terms, Cookies (anchor in the Privacy Policy), Contact/Legal notice          | Garante 2021 cookie guidelines (notice reachable from every page), Art. 12, E-Commerce Art. 5                                                                                                         |
| **Signup form** (email _and_ Google button)       | "By creating an account you agree to the [Terms] and have read the [Privacy Policy]." | Art. 13 information "at the time when personal data are obtained". Contract formation for 6(1)(b). Do **not** use a pre-ticked box, and do not make it a consent checkbox (the basis is not consent). |
| **Login form**                                    | "Keep me signed in (uses a cookie)" checkbox, unchecked by default; Privacy link      | WP194 §3.2 on persistent login cookies                                                                                                                                                                |
| **Auth emails** (verification, reset)             | Footer with provider identity and a Privacy link                                      | Good practice. Transactional emails need no unsubscribe link.                                                                                                                                         |
| **Google Cloud Console → OAuth Branding**         | Home page, Privacy Policy, Terms, support email                                       | Required for external production apps                                                                                                                                                                 |
| **In-app account menu** (later)                   | Privacy, Terms, "Delete account", "Export data"                                       | Arts. 17 and 20 (not a page requirement, but where users will look)                                                                                                                                   |

## 8. Checklist of facts the owner must supply

- [ ] **Controller / provider identity:** legal name (person or company), postal address, contact email (a dedicated privacy@ or support@ is advisable). Decide whether to publish a home address.
- [ ] **Business status:** hobby or individual vs. registered business. If a business: P.IVA, REA/registry number, PEC if applicable.
- [ ] **Neon project region** (EU or US) and the Neon/Databricks DPA status.
- [ ] **DPA acceptance** for Cloudflare, Neon and Resend. Confirm each applies to your plan, and keep copies.
- [ ] **Cloudflare plan** (Free = 3-day logs, Paid = 7-day) and whether Workers Logs/Traces stay enabled in production.
- [ ] **Resend region and log retention.**
- [ ] **Retention periods:** deleted accounts (immediate vs. grace period), backups (Neon point-in-time restore window), rate-limit rows, expired sessions and verifications.
- [ ] **Minimum age** (14 for Italy only, or 16 EU-wide).
- [ ] **Languages** of the legal pages (English plus Italian?).
- [ ] **Governing law / courts** (Italy) and the effective date and version of each document.
- [ ] **Google profile picture:** proxy it, use initials, or disclose the hotlinked request.
- [ ] **"Keep me signed in":** adopt it (recommended) or accept the WP194 risk.
- [ ] **How users exercise their rights:** by email now; self-serve deletion and export later.
- [ ] **Google Cloud:** verify `productivity-up.com` in Search Console, set the support email and developer contact, prepare a 120x120 logo.
- [ ] **Commitment:** no analytics or marketing use of data (keeps the app out of the cookie banner and, likely, out of the Digital Content Directive). Revisit this note if that changes.

## Sources

- GDPR (EU) 2016/679, Arts. 6, 8, 12-14, 15-22, 28, 30, 37, 44-49: <https://eur-lex.europa.eu/eli/reg/2016/679/oj>
- ePrivacy Directive 2002/58/EC Art. 5(3): <https://eur-lex.europa.eu/eli/dir/2002/58/2009-12-19>
- EDPB Guidelines 2/2023 on the technical scope of Art. 5(3) ePD, v2.0 (16 Oct 2024): <https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-22023-technical-scope-art-53-eprivacy-directive_en>
- WP29 Opinion 04/2012 on Cookie Consent Exemption (WP194), §§3.2-3.3: <https://ec.europa.eu/justice/article-29/documentation/opinion-recommendation/files/2012/wp194_en.pdf>
- Garante privacy, "Linee guida cookie e altri strumenti di tracciamento", 10 June 2021: <https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/9677876>
- E-Commerce Directive 2000/31/EC Art. 5: <https://eur-lex.europa.eu/eli/dir/2000/31/oj>; Italy D.Lgs. 70/2003 Art. 7
- Digital Services Act (EU) 2022/2065, Arts. 3, 11-17: <https://eur-lex.europa.eu/eli/reg/2022/2065/oj>
- Directive (EU) 2015/1535 Art. 1(1)(b) (ISS definition); CJEU C-291/13 _Papasavvas_
- Digital Content Directive (EU) 2019/770 Art. 3(1): <https://eur-lex.europa.eu/eli/dir/2019/770/oj>
- European Accessibility Act (EU) 2019/882 Art. 4(5)
- Google API Services User Data Policy: <https://developers.google.com/terms/api-services-user-data-policy>
- Google Cloud help, OAuth Branding page: <https://support.google.com/cloud/answer/15549049>; brand verification requirements: <https://support.google.com/cloud/answer/13464321>; when verification is not needed: <https://support.google.com/cloud/answer/13464323>; verification for non-sensitive scopes: <https://support.google.com/cloud/answer/13463073>
- Cloudflare Customer DPA: <https://www.cloudflare.com/cloudflare-customer-dpa/>; Resend DPA: <https://resend.com/legal/dpa>; Neon DPA: <https://neon.com/dpa>
- Cloudflare Workers Logs retention: <https://developers.cloudflare.com/workers/observability/logs/workers-logs/>
- Better Auth 1.7.7 source (`dist/cookies/index.mjs`, `dist/state.mjs`, `dist/context/create-context.mjs`) for cookie names and lifetimes
