# SACONE Owner

A separate web app for the business owner, containing only:

- **CEO Dashboard**: KPIs, profit, cash and UPI flow, receivables and payables ageing, inventory health, top products and customers, alerts.
- **Income & Expense**: record income and expenses, submit, approve and void them, see a summary by category and mode, and manage categories.

Everything else stays in the ERP (`sacone-erp`, :3000). Banking (cash/bank/UPI books, bank import, party payments, payment accounts) is in **ERP → Banking & Cash**. POS billing is only in the **SAC-POS** mobile app.

## Run

```bash
npm install
npm run dev        # http://localhost:3001
```

`start-all.bat` in `sacone/` starts it together with the API and ERP.

SACONE Owner is not linked from the ERP. It opens only with your private **owner key**
(no ERP login), which signs you in as the group owner (all firms, live data). Make or change
the key on the server PC:

```bash
cd sacone-api
npm run owner-key            # new key, shown once (the old key stops working)
npm run owner-key -- status  # is a key set (last 4 characters)
npm run owner-key -- off     # remove it: SACONE Owner cannot be opened
```

Only a SHA-256 hash of the key is stored; wrong keys are locked out for 10 minutes after 5 tries.

## Configuration

Copy `.env.local.example` to `.env.local` only if the defaults don't fit:

| Variable | Default | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | SACONE API |
| `NEXT_PUBLIC_ERP_URL` | `http://localhost:3000` | Where drill-down links (customers, products…) open |

The API must allow this app's origin. `http://localhost:3001` is allowed by default; for another address, set `OWNER_APP_ORIGIN` in `sacone-api/.env`.

## Structure

```
app/login            sign-in
app/(owner)/ceo      CEO Dashboard
app/(owner)/income-expense
components/          OwnerShell (top bar), SmartLink (ERP/owner/none link resolver), shared UI, CEO widgets
lib/                 api client, auth, links (ERP URL + owner permissions)
```
