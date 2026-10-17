# Teaching Assistant health dashboard

An internal, read-only page with a summary, charts and tables of n8n executions, backend errors and frontend errors for the Teaching Assistant. Light appearance only. It is a separate app from the frontend and shares only its look.

## Run

```
npm install
npm run dev        # http://localhost:5173
npm test
npm run build      # static files in dist/
```

Open `http://localhost:5173/?mock=1` to see it with sample data and no backend.

For real data locally, the Worker has to run too. Put the two secrets in a `.dev.vars` file (`PASSWORD_HASH="…"` and `N8N_KEY="…"`, not committed), then:

```
npm run build
npx wrangler dev   # http://localhost:8787, the page and the Worker together
```

`npm run dev` passes `/api` requests on to that Worker, so both can run side by side while you edit.

## Sign-in

A Cloudflare Worker (`worker/index.js`) sits in front of the built page. Without a session it serves only the sign-in page; everything else redirects to `/login`. There is one shared password.

- The password is never stored. The Worker keeps a salted PBKDF2-SHA256 hash of it (100,000 iterations) in the `PASSWORD_HASH` secret and compares against that.
- A correct password sets a signed cookie that lasts 7 days and that page scripts cannot read. Changing the password signs everyone out.
- Sign-in attempts are limited to 10 a minute per address.

To set or change the password:

```
node scripts/hash-password.mjs          # asks for the password, prints the hash
npx wrangler secret put PASSWORD_HASH   # paste the hash
```

`wrangler.jsonc` holds the Worker's name, which must match the Worker in the Cloudflare dashboard.

## How it gets data

The page makes one request: `POST /api/stats?env=dev|staging|production&range=1h|24h|7d|30d`, to its own Worker. It sends it when the page opens, once an hour while it stays open, and when Refresh is pressed.

The Worker checks the session, then calls `POST {n8n}/webhook/dashboard-stats?range=…` on that environment's n8n host with the header `X-Dashboard-Key`, whose value is the `N8N_KEY` secret (`npx wrangler secret put N8N_KEY`). The JSON body is the window to query, for example `{ "range": "24h", "since": "2026-10-16T09:00:00.000Z", "until": "2026-10-17T09:00:00.000Z" }`; in n8n it is `{{ $json.body.since }}` and `{{ $json.body.until }}`.

**The webhook is only protected once n8n checks that header.** In each environment's `dashboard-stats` workflow, set the Webhook node's Authentication to Header Auth, with name `X-Dashboard-Key` and the same value as `N8N_KEY`. Until then, anyone who can reach the webhook URL gets the same rows.

## What the webhook must return

Raw table rows as JSON. They can be a flat array or nested the way n8n groups them (for example `[{ "data": [rows] }]` from an Aggregate node); the page finds the rows wherever they sit and tells the tables apart by their columns (`src/normalise.js`):

| Table | Recognised by | Columns the page uses |
|---|---|---|
| `error_log` | `error_message` | `occurred_at`, `level`, `workflow_name`, `workflow_id`, `node_name`, `error_message`, `execution_id`, `environment` |
| `frontend_error_log` | `received_at` and `source` | `received_at`, `source`, `message`, `route`, `app_variant`, `raw_payload` (for `webhook` and `status`) |
| `feedback` | `vote` | `timestamp`, `vote`, `reasons`, `comment`, `variant` |
| `user_reports` | `report_id` and `kind` | `timestamp`, `kind`, `satisfaction`, `description`, `comment`, `user_name`, `variant` |
| n8n executions ("Get many executions") | `startedAt` and `workflowId` | `startedAt`, `stoppedAt`, `status`, `workflowId` |
| n8n workflows ("Get many workflows"), optional | `id`, `name` and `active` | `id`, `name`: used to show workflow names instead of ids |
| request count (already counted and time-filtered by the workflow) | `request` and `count` | `request`, `count` |

The page also applies the time range itself, so a workflow that ignores `since` still works, only slower. A section appears only when the reply contains rows from its table.

The "Most requested prompts" card shows the top 8 `request count` rows, adding together requests with the same text (ignoring capitals and surrounding spaces). Those rows have no timestamp, so the page trusts the workflow's time filter for them.

`n8n/dashboard-stats.workflow.json` and `n8n/readonly-role.sql` are an earlier design (aggregated reply plus endpoint health from the n8n API) and do not match what the page now expects. The Endpoints section is still in the code but stays hidden, because the current reply has no endpoint data.

## What the optional read-only role can read

Column-level grants limit it to what the page shows. It cannot read stacks, IP addresses, user agents, emails, attachments, chat text or `error_log.context`. It can read `frontend_error_log.raw_payload` (needed for the failing endpoint and HTTP status), which also holds the user id and user agent the frontend sent.

## Keeping it in step with the frontend

- `src/endpoints.js` is a copy of the frontend's `WEBHOOKS` paths.
- `src/tokens.css` and `public/fonts/` are copies of the frontend's theme tokens and fonts. Icons must be names already in the frontend's Material Symbols subset.
