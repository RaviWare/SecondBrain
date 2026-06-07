# SecondBrain Cloud — Pricing Strategy & Plan

> Committed product doc. Antigravity / any agent: this is the agreed pricing direction.
> Implement the consolidated pricing page per this spec. When a value here conflicts with
> stale copy elsewhere in the app, this doc wins (and update the app to match).

## Decision (agreed)

**One product, one pricing ladder — NOT two separate offerings.** Earlier we had two
disconnected things: an $18/mo self-serve "Pro" (Stripe) and a $99/mo "AI squad" offer
(Paddle, "replaces a marketing analyst / content writer…"). These targeted different
buyers with different checkouts and split the message. We are consolidating into a single
3-tier ladder under one hero positioning.

**Primary Q1 objective bias:** optimize for **users + learning**, not revenue/ACV. Lead
with a frictionless Free tier (that's the 1,000-user engine), a cheap self-serve Pro, and
a capped premium "Squad" tier for revenue + high-touch validation.

> ⚠️ OPEN DECISION for the founder to confirm: is the Q1 goal **1,000 users** or **1,000
> paying customers**? This doc assumes **1,000 users** (free-led). If it's paying
> customers, the strategy shifts toward a sales-heavy, Squad-led motion — flag before
> building.

## The ladder

| Tier | Price | Buyer | Purpose |
|---|---|---|---|
| **Free** | $0 | Individuals trying it | Top-of-funnel; reach the "aha" (a cited answer from their own notes) fast. Drives the 1,000-user goal. |
| **Pro** | $18/mo (keep current) | Individuals | Unlimited vault + basic agents. Self-serve upgrade. Volume revenue. |
| **Squad** (early access) | $99/mo (anchored from $499) | Power users / small teams | The autonomous agent squad + done-with-you onboarding. Capped seats. High-touch. Premium revenue + testimonials. |

### Tier details

**Free — $0**
- 25 ingests/mo, 50 queries/mo, 1 vault (matches current limits)
- Cited AI memory + gap analysis
- CTA: "Start your brain free" (confirm: no card required)

**Pro — $18/mo**
- Unlimited ingests + queries, multiple vaults
- Basic agents
- Priority-ish support
- Keep the existing Stripe integration / `STRIPE_PRO_PRICE_ID`

**Squad — $99/mo (Limited Early Access, was $499)**
- Unlimited AI agents — name them, give them roles, hire/fire
- Personalized onboarding: lead agent designs your squad with you
- Shared task board, threads, @-mentions, activity feed
- Bring-your-own-AI (ChatGPT recommended; Claude / MiniMax / Z.AI also work)
- Dedicated, isolated workspace (data stays yours)
- Real onboarding · priority support · the founder replies
- **CAP the seats** so the founder can personally make each customer successful
  (turns them into testimonials, not refunds).

## Payment processor — pick ONE
Running Stripe ($18) AND Paddle ($99) doubles tax/reconciliation/support surface.
- **Stripe** — already wired (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_PRO_PRICE_ID`, webhook at `src/app/api/stripe/webhook/route.ts`). Lowest effort.
- **Paddle** — merchant-of-record (handles global sales tax/VAT for you), nicer for
  international solo founders.
- **Recommendation:** stay on **Stripe** for now (it's built); revisit Paddle only if
  global tax handling becomes a real burden. Do NOT run both.

## Positioning guardrails
- Lead with ONE hero so a visitor understands the product in 5 seconds. Don't market a
  "$18 note app" and a "$99 AI employee" as separate things.
- The "replaces a marketing analyst / content writer / …" framing is a BIG promise — only
  lead with it on the Squad tier, and only if agents can credibly deliver. Over-promising
  spikes signups then spikes churn/refunds (and the founder eats that support).
- Keep privacy-first messaging consistent (encrypted, single-tenant, never trains on user data).
- Never use internal code names ("Hermes", "gstack", "GBrain") in pricing copy.

## Implementation notes (for Antigravity)
- Current state: `/app/settings` Plan section already reads the REAL plan (`isPro`) and
  shows Free vs Pro. Stripe checkout exists (`/api/stripe/checkout`).
- Build/repoint the public **pricing page** to show all three tiers (Free / Pro / Squad)
  per this doc. Follow the mandatory glass theme (see HANDOFF.md §3).
- The Squad tier maps onto the existing agent/mission features (`src/lib/agents/*`,
  `/app/missions`, `/app/agents`) — it's a packaging/positioning layer over what's built,
  not new core engineering. Verify what's actually deliverable before publishing the promise.
- Keep all numbers honest (NO DUMMY DATA): don't show fake "X customers" social proof.

## Open questions to resolve before launch
1. Q1 goal: 1,000 **users** or 1,000 **paying**? (changes the whole motion)
2. Is the Free tier truly no-card-required?
3. Squad tier seat cap number?
4. Stripe-only confirmed, or is global tax a reason to move to Paddle?
