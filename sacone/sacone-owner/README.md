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

Sign in with your SACONE ERP login. You need at least one of these permissions:

| Permission | Opens |
|------------|-------|
| `reports.ceo_dashboard.view` | CEO Dashboard |
| `finance.ledger.view` (+ `.create` / `.edit` / `.approve` / `.delete`) | Income & Expense |

Other roles see a "No owner access" screen.

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
