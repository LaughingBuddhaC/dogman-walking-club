# DogMan Walking Club

Bilingual (DA/EN) booking site with an admin page.

- `public/` – the site (`/`) and the admin page (`/admin/`). Built from `src/` with `npm run build`.
- `api/` – booking API (Vercel serverless functions). Data is stored in Upstash Redis.
- `public/photo.jpg` – add a square photo of you and Boris here; it replaces the geometric artwork.

## Deploy on Vercel

1. Push this folder to a new GitHub repository and import it in Vercel (framework preset: Other).
2. In the Vercel project: Storage → Marketplace → Upstash for Redis → create a free database and connect it.
   This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
3. Settings → Environment Variables → add `ADMIN_PASSWORD` (a long password only you know). Redeploy.
4. Settings → Domains → add `dmw.cansasmaz.com`, then add the CNAME record Vercel shows at your DNS provider.
5. Open `/admin/`, log in, and fill in prices, MobilePay number and opening hours under Settings.

## Run locally

`npm run dev` → http://localhost:3000 (data kept in memory, admin password `dev`).
