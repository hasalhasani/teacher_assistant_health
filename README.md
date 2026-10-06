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

## How it gets data

The page makes one request: `POST {n8n}/webhook/dashboard-stats` with `{ "range": "1h" | "24h" | "7d" }`. It sends it when the page opens, once an hour while it stays open, and when Refresh is pressed.

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

The page applies the time range itself, so the workflow can return everything it has. A section appears only when the reply contains rows from its table. The webhook has no authentication: anyone who can reach the URL gets the same rows.

`n8n/dashboard-stats.workflow.json` and `n8n/readonly-role.sql` are an earlier design (aggregated reply plus endpoint health from the n8n API) and do not match what the page now expects. The Endpoints section is still in the code but stays hidden, because the current reply has no endpoint data.

## What the optional read-only role can read

Column-level grants limit it to what the page shows. It cannot read stacks, IP addresses, user agents, emails, attachments, chat text or `error_log.context`. It can read `frontend_error_log.raw_payload` (needed for the failing endpoint and HTTP status), which also holds the user id and user agent the frontend sent.

## Keeping it in step with the frontend

- `src/endpoints.js` is a copy of the frontend's `WEBHOOKS` paths.
- `src/tokens.css` and `public/fonts/` are copies of the frontend's theme tokens and fonts. Icons must be names already in the frontend's Material Symbols subset.
