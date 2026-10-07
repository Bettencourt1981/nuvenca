import { type NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { billingConfigured, stripe, syncSubscription } from "@/lib/billing/stripe";

/** The subscription an event is about, if any. */
function subscriptionOf(event: Stripe.Event): string | null {
  const object = event.data.object as unknown as Record<string, unknown>;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription" || !session.subscription) return null;
      return typeof session.subscription === "string" ? session.subscription : session.subscription.id;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      return String(object.id);
    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscription = invoice.parent?.subscription_details?.subscription;
      if (!subscription) return null;
      return typeof subscription === "string" ? subscription : subscription.id;
    }
    default:
      return null;
  }
}

/**
 * Stripe webhooks. The signature is verified with STRIPE_WEBHOOK_SECRET; the
 * subscription is then re-read from Stripe (events can arrive out of order)
 * and applied to its workspace.
 */
export async function POST(request: NextRequest) {
  if (!billingConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 404 });
  const signature = request.headers.get("stripe-signature");
  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(body, signature ?? "", process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const subscriptionId = subscriptionOf(event);
  if (subscriptionId) {
    try {
      await syncSubscription(subscriptionId);
    } catch (error) {
      // A 500 makes Stripe retry later.
      console.error("Billing webhook failed", event.type, error instanceof Error ? error.message : error);
      return NextResponse.json({ error: "sync_failed" }, { status: 500 });
    }
  }
  return NextResponse.json({ received: true });
}
