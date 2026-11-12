# Zamora Liquor Store — Frontend (React + Vite + PWA)

Offline-first POS, Inventory, CRM, Debt Ledger, Financial Reporting, and Customer Portal frontend.

## Deploying to Vercel

1. Import `stevedev-ops/zamora_frontend` as a new Vercel project.
2. Vercel auto-detects the `vite` framework from `vercel.json` (`npm run build` → `dist`).
3. Add or verify the environment variable in **Vercel → Project Settings → Environment Variables** (also defaulted for production builds in `.env.production`):
   - `VITE_API_URL`: `https://zamora-backend.onrender.com`
4. Deploy (or redeploy after changing `VITE_API_URL`, since Vite injects `VITE_*` variables at build time).
5. Ensure `FRONTEND_URL` on Render matches your Vercel URL (`https://zamora-beta.vercel.app`) so CORS and customer portal share links point to your live Vercel site.
