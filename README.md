# The Nail Nurse

The project has a Next.js client website and a Flask API backed by SQLite.

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

For production, set a private random `SECRET_KEY`, set `FRONTEND_ORIGIN` to the
deployed Next.js origin, and set `COOKIE_SECURE=true` when serving over HTTPS.
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
`127.0.0.1:3000`; production requests are limited to the configured frontend
origin.

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
