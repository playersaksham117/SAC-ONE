# Finance Module — Manual Income & Expense Manager

## Overview

The Finance module records **manual** business income and expenses that are **not** automatically captured by:

- POS sales
- Sales invoices
- Purchase invoices
- Customer payments
- Supplier payments

All manual entries use the `financial_transactions` table with explicit `source` tracking to avoid duplication.

## Database (Migration 011)

| Table | Purpose |
|-------|---------|
| `financial_payment_accounts` | Configurable cash, UPI, bank, and other accounts with opening balances |
| `financial_categories` | Configurable income/expense categories (seeded defaults + custom) |
| `financial_transactions` | Unified financial transaction model |

### Transaction statuses

`draft` → `submitted` / `pending_approval` → `posted` | `rejected` | `voided`

Only **`posted`** entries with source `manual_income`, `manual_expense`, or `correction` affect dashboard totals.

### Settings (system_settings)

| Key | Default | Description |
|-----|---------|-------------|
| `finance.approval_required` | `true` | Require approval workflow |
| `finance.approval_threshold_amount` | `10000` | INR threshold for mandatory approval |
| `finance.auto_post_below_threshold` | `true` | Auto-post below threshold when submitter can approve |

## API Endpoints

Base: `/api/finance`

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/bootstrap` | view | Categories, accounts, enums, settings |
| GET | `/reports` | view | Dashboard summaries |
| GET/POST | `/categories` | view / edit | Category list & create |
| PUT | `/categories/:id` | edit | Update / activate / deactivate |
| GET/POST | `/accounts` | view / edit | Payment accounts |
| PUT | `/accounts/:id` | edit | Update account |
| GET/POST | `/transactions` | view / create | List & create draft |
| PUT | `/transactions/:id` | edit | Edit draft or rejected |
| POST | `/transactions/:id/submit` | create | Submit for approval / auto-post |
| POST | `/transactions/:id/approve` | approve | Approve & post |
| POST | `/transactions/:id/reject` | approve | Reject |
| POST | `/transactions/:id/void` | delete | Void posted entry (audit reversal) |

## Transaction Flow

```
Create (draft)
    ↓ submit
pending_approval ──approve──→ posted (affects balances)
    │ reject
    └──→ rejected (editable, no balance impact)

posted ──void──→ voided + reversal audit record (no balance impact)
```

### Cash / UPI / Bank separation

Payment mode drives flow classification:

| Mode | Income | Expense |
|------|--------|---------|
| cash | Cash In | Cash Out |
| upi | UPI In | UPI Out |
| bank, cheque | Bank In | Bank Out |

## CEO Dashboard Integration

Posted manual transactions feed:

- **Cash Flow** — manual cash in/out merged with POS cash and supplier cash payments
- **UPI Flow** — manual UPI in/out merged with POS UPI and supplier UPI
- **Bank Flow** — manual bank in/out merged with POS bank/cheque and supplier bank/cheque
- **Other Income** — sum of posted manual income
- **Operating Expenses** — sum of posted manual expenses
- **Estimated Operating Profit** — `Gross Profit + Other Income − Operating Expenses`

Payment account opening balances provide opening/closing cash, UPI, and bank book values.

## Role Permissions

| Role | Permissions |
|------|-------------|
| Owner/Admin | All `finance.ledger.*` |
| Manager | view, create |
| Accountant | view, create, edit |
| Cashier | No finance access by default |
| Viewer | view only (via role assignment) |

## Test Cases

1. **Create draft expense** — status `draft`, CEO dashboard unchanged
2. **Submit below threshold as admin** — auto-posts, expense appears in CEO dashboard
3. **Submit above threshold as manager** — stays `pending_approval`, no dashboard impact
4. **Approve pending transaction** — posts, flows update
5. **Reject transaction** — no dashboard impact, editable
6. **Void posted transaction** — excluded from totals, reversal audit row created
7. **UPI expense** — increases UPI Out only, not Cash Out
8. **Custom category** — create, assign to transaction, appears in reports
9. **Payment account opening balance** — reflected in closing balance calculation

## Limitations

- Attachments store path/name only (no file upload endpoint yet)
- Firm/branch filters reserved; schema supports `firm_id` / `branch_id`
- No automatic deduplication against external reference IDs beyond source tracking
- Correction workflow uses `correction` source (future UI)
