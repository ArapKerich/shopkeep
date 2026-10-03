# Shopkeep Backend Guide

This guide describes the Firebase pieces currently connected to Shopkeep and the recommended steps for adding real payments with Stripe or Safaricom M-Pesa Daraja.

## What Is Connected Today

- `firebase-config.js` contains the Firebase Web app configuration. These values identify the project; they are not service-account credentials.
- `firebase.js` initializes the Firebase browser SDK, Authentication, and Firestore when those SDKs are present on the page.
- `login.html` and `signup.html` provide email/password sign-in, account creation, and password reset through `auth-page.js`.
- `index.html` listens for Firebase Auth state. Signed-out users are sent to `login.html`; signed-in users load their store data.
- A new user's store ID defaults to their Firebase Auth UID. A trusted custom claim can instead provide `storeId` and `role` for staff accounts.
- The first load of an empty owner store seeds it with the sample product list in `index.html`.
- Product changes, stock adjustments, sales, and stock movements are written to Firestore using client-side write batches. Failed writes trigger a data reload and an error toast.
- `firestore.rules` scopes reads and writes to a user's own store or a store ID in their verified token claims.
- `firebase.json` points the Firebase CLI at `firestore.rules`.

## Firestore Data Layout

The app uses these paths:

```text
shops/{storeId}/products/{productId}
shops/{storeId}/sales/{saleId}
shops/{storeId}/stock_movements/{movementId}
```

Products contain fields such as `sku`, `name`, `cat`, `emoji`, `cost`, `price`, `stock`, and `reorder`.

Sales contain `t`, `items`, `sub`, `disc`, `tax`, `total`, `status`, `by`, and optionally `email`. Each item records its product ID, name, quantity, and price at the time of sale.

Stock movements contain `t`, `pid`, `name`, `type`, `qty`, `ref`, `by`, and optionally `note`.

The current checkout is explicitly a demo: it writes a sale with `status: recorded`; it does not collect card details or charge a customer. The Refund action changes the sale status and restores inventory only. It does not issue a Stripe or M-Pesa refund.

## Important Production Gaps

- Browser code and custom UI roles are not a security boundary. Firestore rules must enforce who can read and write each record. Never let a client set its own custom claims.
- Current client batches group related writes, but they do not provide server-side pricing validation or protect against two cashiers selling the same last item at once. Use a trusted backend transaction for paid orders and stock changes.
- Payment status must come from a verified provider webhook/callback, not from a browser redirect or a client saying payment succeeded.
- Never store card numbers, CVVs, Stripe secret keys, Daraja consumer secrets, or passkeys in Firestore or browser files.

## Recommended Payment Record

Create a payment record before contacting a provider, for example:

```text
shops/{storeId}/payments/{paymentId}
```

Suggested fields:

```text
provider: "stripe" | "daraja"
status: "pending" | "paid" | "failed" | "cancelled" | "refunded"
amount: integer minor units or a documented KES integer convention
currency: "KES"
uid: Firebase Auth UID that started checkout
saleId: related sale ID
providerRequestId: provider-generated identifier, when available
providerReceipt: provider receipt/reference, when paid
createdAt, updatedAt: server timestamps
```

Pick one amount convention and use it consistently. For KES, validate provider-required integer amounts on the server and do not trust a total sent by the browser.

## Shared Backend Steps

1. Decide which provider and checkout method the business needs. Stripe Checkout is typically a hosted card/wallet flow; Daraja STK Push sends an M-Pesa prompt to a customer's phone. They are separate integrations.
2. Add Firebase Cloud Functions to the project with `firebase init functions`. Choose JavaScript or TypeScript and a supported Node.js runtime.
3. Put provider credentials in Firebase/Google Secret Manager and expose them only to the relevant Functions. For example, use `firebase functions:secrets:set STRIPE_SECRET_KEY`. Enter secret values directly in the terminal, not in chat or source files.
4. Require Firebase Authentication in every checkout function. Derive the UID and store membership from the verified auth token; verify the user may sell for that store.
5. Have the server load product prices and stock from Firestore, validate quantities, calculate discounts/tax/total, and create a pending payment. Do not accept authoritative prices or totals from the browser.
6. Confirm success through a provider-signed webhook or callback. Verify the signature or query the provider for the final status, then update payment, sale, stock, and stock movement documents together in a Firestore transaction.
7. Make all webhook/callback handling idempotent. Save each provider event/request ID and ensure processing it twice cannot create duplicate sales or decrement stock twice.
8. Tighten `firestore.rules` so clients cannot mark payments as paid or directly change stock/sale status. Functions using the Admin SDK bypass Firestore rules, so each function must perform its own authorization and input validation.
9. Test in the provider sandbox and Firebase emulators before production. Test success, cancellation, timeout, duplicate callbacks, invalid signatures, insufficient stock, and network retries.

## Stripe Integration Checklist

1. Create a Stripe account and use test mode first. Obtain the test publishable key and secret key from the Stripe Dashboard. The publishable key may be used by the browser if needed; the secret key belongs only in a Cloud Functions secret.
2. Implement an authenticated callable/HTTPS Cloud Function such as `createStripeCheckout`. It should validate the cart from Firestore, create a pending payment/sale, and create a Stripe Checkout Session with server-calculated line items and currency.
3. Return only the Checkout Session URL (or session ID) to the browser, then redirect the customer to Stripe-hosted Checkout. Do not build or store raw card fields in Shopkeep.
4. Configure a public HTTPS webhook endpoint for events such as `checkout.session.completed`, `checkout.session.expired`, and relevant asynchronous payment events. Verify the Stripe signature using the webhook signing secret.
5. On verified successful payment, use a Firestore transaction to re-check stock, decrement product stock, write stock movements, mark the payment paid, and create/update the sale exactly once. Treat the webhook as authoritative, even if the customer closes the return page.
6. Implement refunds in a trusted function. Check the user's role and sale state, call Stripe's refund API with the stored payment/charge reference, then update Firestore after Stripe confirms the refund. Handle refund webhooks and partial refunds if the business needs them.
7. During local development, run the Firebase Functions emulator and Stripe CLI webhook forwarding (for example, forward Stripe events to the local Functions emulator). Use Stripe test cards from Stripe's official testing docs; never use real card data in development.
8. Before launch, switch to live-mode keys and webhook endpoint secrets, configure the production HTTPS URL, verify allowed return URLs, and review Stripe account/webhook status.

## Safaricom M-Pesa Daraja Integration Checklist

1. Create a Safaricom Developer account and a Daraja app. Start with the Daraja Sandbox and its test credentials, shortcode, passkey, and test phone details.
2. Implement an authenticated Cloud Function such as `startMpesaStkPush`. Keep the consumer secret and STK passkey in Secret Manager. The function should validate the signed-in user, store membership, phone number, cart, server-calculated amount, and stock before creating a pending payment.
3. Have the function obtain a Daraja OAuth access token server-side, generate the timestamp and password required for STK Push, then submit the request with the callback URL, account reference, and transaction description.
4. Store the returned `MerchantRequestID` and `CheckoutRequestID` with the pending payment. Return a simple accepted/pending response to the browser; do not mark a sale paid just because the STK prompt was sent.
5. Provide a public HTTPS callback endpoint for Daraja. Validate the expected request identifiers and payload fields, and query Daraja for transaction status when needed. Do not assume an unverified callback body proves payment.
6. For a confirmed success, use an idempotent Firestore transaction to mark payment paid, record the M-Pesa receipt number, create the sale, decrement stock, and add stock movements. For cancellation, timeout, or failure, mark the payment accordingly without changing stock.
7. Give the browser a pending state and a way to refresh/listen for the payment document until it becomes paid, failed, or cancelled. Handle late callbacks and repeated callbacks safely.
8. Test successful prompts, customer cancellation, wrong PIN, timeout, callback retries, duplicate callbacks, and insufficient stock in Sandbox. Before production, request Daraja production access, use production credentials and shortcode/passkey, register the final HTTPS callback URL, and run a small controlled live test.

## Suggested Implementation Order

1. Add and secure Cloud Functions before connecting any real payment provider.
2. Choose either Stripe or Daraja for the first implementation and complete its sandbox flow end to end.
3. Add verified success/failure handling and idempotent Firestore transactions.
4. Lock down Firestore rules and test owner/manager/cashier authorization.
5. Deploy to a staging Firebase project, verify logs and provider callbacks, then deploy production secrets and endpoints.
6. Add the second payment provider only after the shared pending-payment, sale, and stock workflow is reliable.
