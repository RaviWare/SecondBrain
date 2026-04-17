import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_placeholder', {
  apiVersion: '2026-03-25.dahlia',
})

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY === 'your_stripe_secret_key') {
    return NextResponse.json({ error: 'Stripe not configured yet.' }, { status: 503 })
  }

  const user = await currentUser()
  const email = user?.emailAddresses?.[0]?.emailAddress

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'subscription',
    customer_email: email,
    line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/app/settings?upgraded=true`,
    cancel_url:  `${process.env.NEXT_PUBLIC_APP_URL}/app/settings`,
    metadata: { userId },
  })

  return NextResponse.json({ url: session.url })
}
