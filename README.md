# Shopkeep

Shopkeep is a small-shop inventory console and a separate customer storefront for Kenyan goods priced in KSh. The browser apps use Firebase Authentication and Firestore; Firestore rules control account roles and store access.

## Project layout

- `store/`: public product discovery, live-updating categories/products, basket, customer login, and signup pages.
- `admin/index.html`: authenticated staff console for sales, products, inventory, and online orders.
- The admin console includes in-page **Add user**, **Manage users**, and **User logs** views; selecting them does not leave `admin/index.html`.
- `backend/firebase-config.js` and `backend/firebase.js`: public Firebase web configuration and browser SDK initialization shared by the pages.
- `backend/firestore.rules`: Firestore access policy.
- `firebase.json`: Firebase CLI deployment manifest; it stays at the repository root.

## Local preview

Serve the repository root over HTTP, then open `/store/` or `/admin/`. For example, use the VS Code Live Server extension or `firebase emulators:start` after installing/configuring the Firebase CLI. Opening files directly with `file://` will not support Firebase authentication or Firestore.

The admin page links to a shop URL with its store ID. Share that URL with customers. Opening `/store/` directly auto-selects the only published shop, or shows a shop picker if there are multiple shops. Root `index.html` preserves a supplied store ID when forwarding to the storefront, while `login.html` is the staff sign-in page.

## Firebase setup and deployment

1. Put the Firebase web app values in `backend/firebase-config.js` and enable Email/Password in Firebase Authentication.
2. Create a Firestore database and enable Email/Password under Firebase Authentication > Sign-in method. Add your local development hostname and deployed Hosting domain under Authentication > Settings > Authorized domains.
3. From the repository root, sign in with `firebase login`, then deploy this configured project with `firebase deploy --project shop-keep-aa740 --only firestore:rules,hosting`. This setup does not use Cloud Functions or require Blaze.
4. Create the first store by signing up through `signup.html`. The account owns a private store under its Auth UID and receives admin access as its initial owner.
5. In the admin console, use **Add user** and **Manage users** to create staff/admin logins and assign roles; review events under **User logs**. Account creation uses a secondary Firebase Auth app so the current admin stays signed in. New users receive Firebase's password setup email; admins can resend a password reset email. Email changes are requests that the staff member must verify themselves. Passwords are never written to Firestore. Removing a user revokes store access but cannot delete their Firebase Authentication account from browser code.
6. The first admin load mirrors existing products into the public catalog. Share the Shop link shown in the admin navigation (`store/?store=STORE_ID`) with customers.
7. Customers open the shared shop link, then use **Log in** or **Sign up** in the storefront header. Their account can be used to prefill their order details.

No Firestore collections need to be created manually. The first owner login seeds products; user management creates membership/profile/log documents; customer signup creates a customer profile. Firestore creates each collection when its first document is written.

## Storefront behavior

The public catalog is a safe mirror at `shops/{storeId}/public_products`; it omits cost and SKU fields and streams changes to open storefronts. Categories are derived from product categories, so adding a product with a new category publishes that category automatically. Admins can add a public HTTPS image URL when adding or editing a product; that image is included in the public catalog. Customer checkout sends an order request to `shops/{storeId}/orders`. Staff can review and update request status in **Orders**. This is not a payment integration: the displayed total is an estimate and payment/availability must be confirmed with the customer.

## Security notes

- Admin SDK credentials never belong in the browser. Membership and roles are stored in Firestore and guarded by rules, not custom claims.
- User profiles and activity logs are readable by store admins only. Firestore rules restrict changes to active store admins.
- The public signup page creates a new private store owner. It does not grant access to an existing store.
- The shop's public catalog and anonymous order-request endpoint need abuse controls before a high-traffic production launch. Payment status and final prices must be validated server-side before adding a payment provider.
