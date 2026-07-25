# Verification emails (Resend)

## Why codes weren't arriving

`sendEmail()` in `auth-worker.js` bailed out silently when the Worker had
no Resend credentials:

```js
if (!env.RESEND_API_KEY || !env.FROM_EMAIL) return { sent: false, ... };
```

`handleSignup` then returned **HTTP 200** with the code embedded in the
JSON body, and `AuthModal` showed "Account created! Check your email for
verification code." regardless. So the flow looked healthy end to end
while no mail was ever sent.

`RESEND_API_KEY` is a secret (correctly absent from the repo), but
`FROM_EMAIL` was not defined anywhere — not in `wrangler.auth.toml`, not
as a secret. Unless it was set by hand in the Cloudflare dashboard, that
condition was always true and no email could ever go out.

Two other failure modes hit this the same way:

- **Sending from an unverified domain.** Resend returns 403. The old code
  threw on that, which the top-level handler turned into a generic 500.
- **Sending from `@resend.dev`.** That's Resend's sandbox sender — it only
  delivers to the address that owns the Resend account, and drops
  everything else. Signups from any other address vanish.

## Setup

1. **Verify your domain in Resend** — Domains → Add Domain → add the
   DKIM/SPF records they give you to your DNS, wait for "Verified".
   Don't skip this; `onboarding@resend.dev` will not work for real users.

2. **Set `FROM_EMAIL`** in `cloudflare-worker/wrangler.auth.toml`, on the
   verified domain:

   ```toml
   [vars]
   FROM_EMAIL = "MultiBrowse <noreply@yourdomain.com>"
   ```

3. **Set the secrets:**

   ```bash
   cd cloudflare-worker
   wrangler secret put RESEND_API_KEY --config wrangler.auth.toml   # re_...
   wrangler secret put JWT_SECRET     --config wrangler.auth.toml
   wrangler secret put ADMIN_SECRET   --config wrangler.auth.toml
   ```

4. **Deploy:**

   ```bash
   wrangler deploy --config wrangler.auth.toml
   ```

## Check it worked

```bash
# config report
curl -H "Authorization: Bearer $ADMIN_SECRET" \
  https://api-unrealvfx.unrealvfx.workers.dev/diag/email

# config report + live test send
curl -H "Authorization: Bearer $ADMIN_SECRET" \
  "https://api-unrealvfx.unrealvfx.workers.dev/diag/email?to=you@example.com"
```

The response tells you whether the key and from-address are present, what
the from-address is, and — if Resend refused — the exact reason it gave.

Live logs, which now carry the full Resend error:

```bash
wrangler tail --config wrangler.auth.toml
```

## What changed in the code

- `sendEmail()` never throws. It returns `{ sent, reason }` and logs the
  Resend status and body, so a mail failure can't turn a valid signup into
  a 500 with an already-written account row.
- `/signup`, `/resend-verification` and `/forgot-password` return
  `email_sent: false` plus `email_error` when delivery fails.
- `AuthModal` shows that error instead of "check your email".
- **The verification code is no longer returned in the API response.**
  That was an account-takeover hole — anyone could POST `/signup` with
  someone else's address and read the code out of the response. It's now
  behind `DEBUG_RETURN_CODES=true`, for local testing only.
- New `GET /diag/email`, admin-only.

## Deliverability, once it's sending

Codes landing in spam looks identical to codes not arriving. Publish SPF,
DKIM and a DMARC record (`v=DMARC1; p=none; rua=mailto:you@yourdomain.com`
to start), send from a subdomain like `mail.yourdomain.com` so app mail
can't damage your main domain's reputation, and keep the plain-text
fallback short. Resend's dashboard shows bounces and complaints per
message — check it before assuming the Worker is at fault.
