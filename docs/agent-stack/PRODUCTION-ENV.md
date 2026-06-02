# Production Environment Variables — what to set & where to get each

> The COMPLETE list of env vars the production app needs, what each is for, whether
> it differs from your local `.env.local`, and exactly where to obtain the value.
>
> **Never commit real secret values.** `.env.local` is local-only (gitignored);
> production values live in your hosting provider's env/secrets settings (see the
> host-specific section your assistant gives you).

---

## The full list

| Var | Required | Prod value — where to get it | Differs from local? |
|---|---|---|---|
| `MONGODB_URI` | ✅ | MongoDB Atlas → Database → Connect → Drivers → copy the `mongodb+srv://…` string. Use a **prod** DB user + the prod cluster. | Maybe (prod cluster) |
| `ANTHROPIC_API_KEY` | ✅ | console.anthropic.com → API Keys. Can reuse, but a **separate prod key** is cleaner for billing/limits. | Maybe |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ✅ | Clerk dashboard → your **production instance** → API Keys → `pk_live_…` | **YES — swap test→live** |
| `CLERK_SECRET_KEY` | ✅ | Clerk dashboard → production instance → API Keys → `sk_live_…` | **YES — swap test→live** |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | ✅ | `/sign-in` | No |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | ✅ | `/sign-up` | No |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | ✅ | `/app/dashboard` | No |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | ✅ | `/app/dashboard` | No |
| `NEXT_PUBLIC_APP_URL` | ✅ | Your **real public URL**, e.g. `https://app.yourdomain.com` (no trailing slash) | **YES — real domain** |
| `FIRECRAWL_API_KEY` | optional | firecrawl.dev → API Keys. Omit ⇒ URL ingest falls back to cheerio. | Maybe |
| `STRIPE_SECRET_KEY` | optional (billing) | Stripe dashboard → Developers → API keys → **live** `sk_live_…` | **YES if billing — live** |
| `STRIPE_WEBHOOK_SECRET` | optional (billing) | Stripe → Developers → Webhooks → your prod endpoint → Signing secret `whsec_…` | **YES if billing** |
| `STRIPE_PRO_PRICE_ID` | optional (billing) | Stripe → Products → your Pro price → `price_…` (live mode) | Maybe |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | optional (billing) | Stripe → API keys → **live** `pk_live_…` | **YES if billing — live** |
| `SCHEDULER_CRON_SECRET` | optional (scheduler) | Copy from `.env.local`, OR generate fresh: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | Set in prod too |

---

## The 3 critical swaps (test → production)

Everything else can be the same value as local, but these MUST change for prod:

1. **Clerk → live keys.** Local uses `pk_test_`/`sk_test_`. Production needs
   `pk_live_`/`sk_live_` from the Clerk dashboard's **Production** instance (you may
   need to "Create production instance" in Clerk first, and add your domain to it).
2. **`NEXT_PUBLIC_APP_URL` → your real domain** (e.g. `https://app.yourdomain.com`).
   This drives Stripe redirect/return URLs and the agent container's brain-API base.
3. **Stripe → live keys** (only if billing is on at launch). If billing is NOT going
   live tomorrow, you can leave the test Stripe keys or omit them — the app degrades
   gracefully (the checkout route returns 503 "not configured").

`NEXT_PUBLIC_*` vars are baked in at **build time**, so they must be present when the
production image is built, not just at runtime. (The non-public secrets like
`MONGODB_URI`, `CLERK_SECRET_KEY`, `ANTHROPIC_API_KEY` are read at runtime.)

---

## Paste-ready production template (fill in real values in your HOST, not here)

```dotenv
# ── Database ──
MONGODB_URI=mongodb+srv://PROD_USER:PROD_PASS@PROD_CLUSTER.mongodb.net/secondbrain

# ── Claude ──
ANTHROPIC_API_KEY=sk-ant-...

# ── Auth (Clerk) — LIVE keys, not test ──
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/app/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/app/dashboard

# ── Public app URL — your REAL domain, no trailing slash ──
NEXT_PUBLIC_APP_URL=https://app.yourdomain.com

# ── Optional ──
FIRECRAWL_API_KEY=fc-...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# ── Scheduler (optional) ──
SCHEDULER_CRON_SECRET=<64-hex-char secret>
```

---

## Where you SET these depends on your host

- **Vercel:** Project → Settings → Environment Variables (set for "Production").
  Redeploy after saving so the build picks up `NEXT_PUBLIC_*`.
- **Docker on a VPS (Hetzner, etc.):** an env file passed to the container
  (`docker run --env-file /etc/secondbrain/prod.env …`) or `environment:` in a
  compose file. The file lives on the server, `chmod 600`, never in git.
- **Render / Railway / Fly:** the provider's "Environment" / "Secrets" panel.

Your assistant will give you the exact click/command path for the host you pick.
