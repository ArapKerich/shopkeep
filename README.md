# Shopkeep

A simple inventory and sales front end for small businesses. This is the front-end prototype for our Firebase + Stripe project. It runs on sample data (Kenyan goods, prices in KSh) and has no backend yet.

## Run it

No install or build step. Open `index.html` in a browser.

## Screens

- **Dashboard** (owner, manager): sales today, transactions, average order, stock value, 7-day chart, restock list, recent sales with refunds.
- **Sell**: barcode/SKU search, product tiles, cart with discount and 16% VAT, mock card payment, receipt.
- **Products**: search, add, edit, adjust stock.
- **Stock log**: permanent record of every stock change.
- **Portals**: Admin (everything, including adding and removing staff in the Team screen), Staff (sell, add and remove products), Shopper (browse and buy only). Pick one on the landing screen.

## Next steps (backend hookup)

| Front-end function | Replace with |
| --- | --- |
| `confirmPay()` and `payModal()` | Cloud Function that creates a Stripe Checkout Session, then redirect |
| `saveProd()` | Firestore write to `products` |
| `saveAdj()` and `mv()` | Firestore transaction: update `products.currentStock` and add a `stock_movements` record |
| `refund()` | Cloud Function that calls the Stripe refund API, then restores stock |
| Role dropdown | Firebase Auth custom claims |

## Notes

- Data lives in memory and resets on refresh.
- Never put the Stripe secret key in this file. It belongs in Cloud Functions config.
- See the project guideline for the full requirements and data model.
