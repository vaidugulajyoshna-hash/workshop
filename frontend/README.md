# Campus Pulse frontend

The frontend is a Vite application under `frontend/`. It calls the Flask API in `Backend/app.py`:

- `GET /api/events` and `GET /api/events/:id` for event discovery and details
- `POST /api/registrations` for registration
- `GET /api/me/registrations?user_id=...` for saved passes

## Local development

Run the API from the repository root in one terminal:

```sh
cd Backend
source venv/bin/activate
python app.py
```

In another terminal, start the frontend:

```sh
cd frontend
npm install
npm run dev
```

Vite proxies `/api` to `http://127.0.0.1:5000` by default. To use another local API, set `VITE_BACKEND_URL` in a `frontend/.env` file. For a separately hosted frontend, set `VITE_API_BASE_URL` to the deployed Flask service origin before building. See `env.example` for the variable names.

The registration endpoints require the UUID of an existing row in the Supabase `users` table. Enter that UUID in the account field; it is saved only in this browser's local storage. Authentication is not provided by the current backend.

If the event request returns `42501` or `permission denied for table events`, the frontend is reaching Flask and Flask is reaching Supabase, but the database role used by the API lacks permission. Configure the narrow table grants and row-level security policies required for event reads. The current backend does not authenticate callers, so do not bypass RLS with a service-role key or broad write policies until server-side authorization is added.

## Production build

```sh
npm run build
```

The static output is written to `frontend/dist/`.

## GitHub Pages deployment

The repository includes a GitHub Actions workflow that builds `frontend/` and publishes `frontend/dist/` to GitHub Pages.

1. Deploy the Flask API, for example with Render using `render.yaml`.
2. In GitHub, open **Settings > Secrets and variables > Actions** and add `VITE_API_BASE_URL` as a repository variable containing the deployed API origin, such as `https://your-api.onrender.com`.
3. Open **Settings > Pages**, set **Source** to **GitHub Actions**, and push to the `main` branch.
4. Wait for the `Deploy frontend to GitHub Pages` workflow to complete. The site will be available at `https://<github-owner>.github.io/workshop/`.

The workflow sets `VITE_BASE_PATH=/workshop/` automatically. If you rename or move the repository, update that value in `.github/workflows/deploy-pages.yml`.