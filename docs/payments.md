# MacroAisle Plus: entitlements and payments

Status (Nov 5 2026): the Plus tier is built behind the `plusTier` flag (on in staging and local
development, off in production). Upgrading is a **test-mode switch on the device**. No card is
taken and nothing is charged. The price on the page is a placeholder.

## What's free and what's Plus

One table decides it: `FEATURES` in `apps/web/src/lib/entitlements.ts`. To move a feature between
tiers, change its `tier` (and `freeLimit` for counted features). A unit test fails if planning,
swaps, the shopping list/cart or in-store mode are ever marked Plus (`CORE_FREE`).

| Feature | Free | Plus |
| --- | --- | --- |
| Plans to calories, macros and budget | yes | yes |
| Swap or skip recipes | yes | yes |
| Shopping list, cart, in-store mode | yes | yes |
| Prep day, next week, calendar, pantry, deals, eat out, recipes, account sync | yes | yes |
| Household plans | you + 1 person | up to 6 people |
| Imported recipes | 3 | unlimited |
| Fitness app sync (Apple Health, Fitbit, MyFitnessPal) | no | yes |
| AI meal swaps, live store prices, every store near you | not built yet | planned |

Cancelling never deletes anything. Extra household members and imported recipes stay; the person
just can't add more until they upgrade again.

## How the code fits together

- `lib/entitlements.ts`: the feature table, the placeholder price (`PLUS_PRICE`), pure checks
  (`entitled`, `limitFor`, `canAddMore`) and `useEntitlements()` for components. With the flag
  off every check returns "allowed".
- `useSubscription`: the person's tier. Today it's a small store saved in localStorage
  (`<STORE_KEY>:plus`, not synced). **This is the only piece that changes for real payments.**
- `components/paywall.tsx`: `<Paywall feature>` (card linking to `/plus/?from=feature`),
  `<PlusGate feature>` (shows the feature or the paywall), `<PlusBadge>`.
- `/plus/`: the upgrade page. With the flag off it shows the older "planned paid tier" preview.
- Analytics events: `paywall_view {feature}`, `plus_upgrade {interval, mode}`, `plus_cancel`.
  These give the conversion funnel for the investor deck once real testers use staging.

## What real payments need (Stripe, recommended)

Stripe has no monthly fee: 2.9% + 30¢ per card charge in the US. Test mode is free and needs no
business verification, so all of this can be built and tested at $0 before going live.

1. **Decide the price.** Placeholder is $4.99/month or $39.99/year. Comparable: Eat This Much
   $59.99/yr, MyFitnessPal Premium $99/yr. Open question in the investor demo kit.
2. **Stripe account** (Michael): create it, add a Product "MacroAisle Plus" with a monthly and a
   yearly Price. Live mode needs a legal name, bank account and SSN/EIN; an LLC is planned after
   funding, a sole proprietorship works until then.
3. **Checkout.** The site is static, so use Stripe Checkout (hosted page). Either:
   - Payment Links (no code; pass `client_reference_id=<supabase user id>` in the URL), or
   - a Supabase Edge Function `create-checkout` that creates a Checkout Session for the signed-in
     user and returns its URL (better: sets the customer email and success/cancel URLs).
   Plus requires an account, so the upgrade button sends signed-out people to sign in first.
4. **Webhook.** A Supabase Edge Function `stripe-webhook` (free tier covers it) verifies the
   Stripe signature with the webhook secret and handles `checkout.session.completed`,
   `customer.subscription.updated` and `customer.subscription.deleted`, writing a row to a new
   `subscriptions` table: `user_id, stripe_customer_id, stripe_subscription_id, status, price_id,
   current_period_end, cancel_at_period_end`. RLS: users can read their own row; only the service
   role writes.
5. **Read the entitlement.** Replace the localStorage store in `useSubscription` with a read of the
   user's `subscriptions` row (tier = plus when status is `active` or `trialing`, or `past_due`
   within a grace period). Keep the last known value on the device for offline use. Remove the
   test-mode button from production builds.
6. **Manage and cancel.** Link to the Stripe Customer Portal (a `create-portal-session` Edge
   Function) for card changes, invoices and cancelling.
7. **Secrets** (never in the browser or the repo): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
   as Supabase Edge Function secrets. The publishable key is public and can go in `pages.yml`.
8. **Legal before charging anyone:** Terms of Service and a refund policy; clear auto-renewal
   terms and an easy online cancel (California and several other states require both); a receipt
   email (Stripe sends these). Sales tax: Stripe Tax costs 0.5% per transaction; most states don't
   tax this kind of subscription at small volume, so it can wait until revenue grows, but check.
9. **Native apps later:** Apple and Google require their own in-app purchase for digital
   subscriptions sold inside the app (15-30% fee). A service like RevenueCat (free under
   $2.5k/month revenue) can unify those with Stripe. Only matters after the web pilot.
10. **Flip the flag** in production (`plusTier: production: true`) when the above is live.

Alternatives: Lemon Squeezy or Paddle act as merchant of record (they handle sales tax) for about
5% + 50¢ per charge. Worth it if tax filing becomes a burden; Stripe is cheaper and more common.
