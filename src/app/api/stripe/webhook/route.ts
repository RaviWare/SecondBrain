/**
 * Stripe webhook — flips users between free ⇄ pro based on subscription state.
 *
 * Local dev:
 *   1. `stripe listen --forward-to localhost:30001/api/stripe/webhook`
 *   2. Copy the `whsec_…` secret it prints into .env.local as STRIPE_WEBHOOK_SECRET
 *   3. Trigger: `stripe trigger checkout.session.completed`
 *
 * Production:
 *   Add the endpoint URL in dashboard.stripe.com → Developers → Webhooks,
 *   subscribe to checkout.session.completed, customer.subscription.updated,
 *   and customer.subscription.deleted, then paste its signing secret into env.
 *
 * Security:
 *   - Body is consumed as raw text and verified via `stripe.webhooks.constructEvent`
 *   - Without a valid signature, the request is rejected with 400
 *   - userId comes from session metadata we set at checkout time, so we never
 *     trust a userId from the client
 */
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { connectDB } from '@/lib/mongodb'
import { UserPlan } from '@/lib/models'

// IMPORTANT: never mark as edge — Stripe SDK + raw body need Node runtime.
export const runtime = 'nodejs'
// Disable any body parsing so we can verify the raw signature.
export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_placeholder', {
  apiVersion: '2026-03-25.dahlia',
})

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET

export async function POST(req: NextRequest) {
  if (!WEBHOOK_SECRET) {
    console.error('[stripe webhook] STRIPE_WEBHOOK_SECRET not set')
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 503 },
    )
  }

  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  // Raw body for signature verification.
  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[stripe webhook] signature verification failed:', msg)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    await connectDB()

    switch (event.type) {
      // Initial subscription purchase — checkout completed.
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.userId
        if (!userId) {
          console.warn('[stripe webhook] checkout.session.completed without userId metadata')
          break
        }
        await UserPlan.updateOne(
          { userId },
          {
            $set: {
              plan: 'pro',
              stripeCustomerId: typeof session.customer === 'string'
                ? session.customer
                : (session.customer?.id ?? null),
              stripeSubscriptionId: typeof session.subscription === 'string'
                ? session.subscription
                : (session.subscription?.id ?? null),
            },
          },
          { upsert: true },
        )
        console.log(`[stripe webhook] ${userId} upgraded to pro`)
        break
      }

      // Subscription state changed (renewal, plan switch, payment failure recovery, etc.)
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const isActive = sub.status === 'active' || sub.status === 'trialing'
        await UserPlan.updateOne(
          { stripeSubscriptionId: sub.id },
          { $set: { plan: isActive ? 'pro' : 'free' } },
        )
        console.log(`[stripe webhook] subscription ${sub.id} status=${sub.status}`)
        break
      }

      // Cancelled / expired — drop back to free.
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        await UserPlan.updateOne(
          { stripeSubscriptionId: sub.id },
          {
            $set: { plan: 'free' },
            // Keep customer id around for re-subscriptions; clear sub id.
            $unset: { stripeSubscriptionId: '' },
          },
        )
        console.log(`[stripe webhook] subscription ${sub.id} cancelled → free`)
        break
      }

      default:
        // Quietly ignore other event types (Stripe sends many we don't care about).
        break
    }

    // Always 200 so Stripe doesn't retry on events we intentionally ignored.
    return NextResponse.json({ received: true })
  } catch (err: unknown) {
    console.error('[stripe webhook] handler error:', err)
    // Returning 500 makes Stripe retry — desirable for transient DB blips.
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }
}
