# SACONE local server

This PC is the server. The data lives in a local SQLite database
(`sacone-api/data/sacone.db`) and the apps are reached through a local domain:

| URL | App | Port behind it |
|-----|-----|----------------|
| http://erp.sacone.local (or http://sacone.local) | SACONE ERP | 3000 |
| http://owner.sacone.local | SACONE Owner (CEO Dashboard, Income & Expense) | 3001 |
| http://api.sacone.local | API; also the server URL for SAC-POS phones | 4000 |

`http://localhost:3000` and `http://<this PC's IP>:3000` keep working too. Every app works out
where the API is from the address you opened it with, so there is no URL to configure.

## One-time setup

1. Point the domain at this PC. Open PowerShell **as Administrator** in the `sacone` folder:

   ```powershell
   powershell -ExecutionPolicy Bypass -File local-server\setup-hosts.ps1
   ```

   Other PCs in the shop: run the same script there with `-ServerIp <this PC's IPv4>`.
   Phones can't use a hosts file. They use `http://<this PC's IPv4>:3000` (ERP) and
   `http://<this PC's IPv4>:4000` (SAC-POS server URL).

2. Create the database. It holds real data only; no sample products, parties or keys:

   ```bash
   npm run install:all
   npm run db:setup
   ```

## Every day

`start-all.bat`, or:

```bash
npm run dev        # API + ERP + Owner + gateway (the local domain)
npm run dev:pos    # SAC-POS (Expo)
```

The gateway listens on port 80. If something else already uses port 80, set `GATEWAY_PORT=8080`
in `sacone-api/.env` and use `http://erp.sacone.local:8080`. Change the domain with
`LOCAL_DOMAIN` in the same file (then re-run `setup-hosts.ps1 -Domain <new domain>`).

## Real time

The API publishes a notice after every committed database write:

- ERP and Owner screens refresh themselves as soon as someone else changes the data they show
  (the **Live** pill in the header shows the connection). Edit forms and the attendance sheet
  are never replaced while you work on them.
- SAC-POS phones long-poll the server and pull new prices, stock, customers and staff changes
  within a second, instead of waiting for the one-minute sync.

## Working from other networks (Tailscale)

1. Install Tailscale (https://tailscale.com/download) on the server PC and on each phone or
   laptop, and sign in with the same account on all of them.
2. On the server PC run `tailscale ip -4` (or open the Tailscale app) to get its `100.x.x.x`
   address, or use its MagicDNS name such as `shop-pc.tail1234.ts.net`.
3. From anywhere, as long as Tailscale is connected:
   - ERP: `http://100.x.x.x:3000`, Owner: `http://100.x.x.x:3001`
   - SAC-POS server URL: `http://100.x.x.x:4000`

Only devices signed in to your Tailscale account can reach the server; nothing is opened
to the public internet. The API accepts Tailscale origins automatically in local mode.

## Moving to the cloud later

See `sacone-api/docs/CLOUD_LINK.md`: `npm run cloud:export` copies everything to MongoDB and
Supabase and verifies it field by field.
