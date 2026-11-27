# The Nail Nurse

The project has a Next.js client website and a Flask API. Local development
uses SQLite; the Vercel deployment uses hosted PostgreSQL.

## Requirements

- Node.js 20.9 or newer
- Python 3.11 or newer

## Start the Flask API

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m flask --app app setup-admin
python -m flask --app app run --port 5000
```

The setup command asks for an administrator email and a password twice. The
email defaults to `admin@nailnurse.com`; choose a unique email if that one is
already in use. Password input is hidden, passwords must be at least 12
characters, and only a password hash is stored. The database is created at
`backend/instance/nailnurse.sqlite3`.

If the administrator password is forgotten, run
`python -m flask --app app reset-admin-password` from `backend`. Enter the
administrator email and set a new password at the hidden prompts.

For local environment overrides, copy `backend/.env.example` to `backend/.env`
before running Flask.

Never commit production secrets or the SQLite database.

## Start Next.js

In another PowerShell window:

```powershell
cd web
npm run dev
```

Open `http://localhost:3000`. To use another API origin, create `web/.env.local`
with `NEXT_PUBLIC_API_BASE_URL=http://localhost:5000/api`.
For local development, the API accepts both `localhost:3000` and
`127.0.0.1:3000`. In production, the frontend uses `/api` on the same domain.

## Deploy frontend and API together on Vercel

The root `vercel.json` configures two Vercel Services in one project: the
Next.js app in `web/` and the Flask app in `backend/`. Requests under `/api`
are routed to Flask; all other paths are routed to Next.js.

1. Import this repository into Vercel and set the project Root Directory to the
   repository root. The configuration uses Vercel Services (currently Beta).
2. Create a hosted PostgreSQL database and add these Vercel environment
   variables for Production (and Preview if previews should work):
   - `DATABASE_URL`: the provider's PostgreSQL connection URL.
   - `SECRET_KEY`: a long, random, private value.
   - `COOKIE_SECURE`: `true`.
   - `FRONTEND_ORIGIN`: the deployed site's full origin, for example
     `https://my-project.vercel.app`.
3. Before using the deployed API, initialize the PostgreSQL schema and create
   the administrator. From `backend/`, with the production database URL and
   secret configured in your local shell:

   ```powershell
   python -m pip install -r requirements.txt
   python -m flask --app app init-db
   python -m flask --app app setup-admin
   ```

`init-db` creates missing tables only; it does not drop tables or modify
existing records. The deployed backend refuses to start without a PostgreSQL
URL and `SECRET_KEY`, and does not create schema during serverless startup.
The local SQLite database is excluded from Vercel uploads and is not copied,
deleted, or modified by this deployment setup. Moving existing SQLite records
to PostgreSQL is a separate data migration and is not performed automatically.

## Run from VS Code

Press **F5** to start both the Flask API and Next.js. Stop both services with
**Shift+F5** before starting them again.

To create or reset the owner account, open **Terminal → Run Task** and select
**Create owner account** or **Reset owner password**. Password entry happens in
the terminal and is hidden while typing.

## Owner and client flows

- Clients create accounts at `/signin`, agree to the studio policies, and book
  only dates the owner has marked available. Their upcoming bookings and
  payment-confirmation status appear on the booking dashboard.
- The owner signs into `/admin` using the account created by `setup-admin`.
- The owner can mark a client’s deposit as received from the appointment list;
  that booking is then shown as payment-confirmed on the client dashboard.
- Every availability-management and appointment-list API route checks the
  authenticated administrator role on the server.
- Unavailability changes warn before proceeding when appointments already
  exist. Existing bookings are kept; they are not automatically deleted.
- Appointments remain pending until the client sends the GHS 50 deposit.

## Tests

```powershell
cd backend
python -m unittest discover -s tests
```

```powershell
cd web
npm run lint
npm run build
```
