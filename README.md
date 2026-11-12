# Zamora Liquor Store — Frontend (React + Vite + PWA)

Offline-first POS, Inventory, CRM, Debt Ledger, Financial Reporting, and Customer Portal frontend.

## Deploying to Vercel

1. Import `stevedev-ops/zamora_frontend` as a new Vercel project.
2. Vercel auto-detects the `vite` framework from `vercel.json` (`npm run build` → `dist`).
3. Add the environment variable in **Vercel → Project Settings → Environment Variables**:
   - `VITE_API_URL`: Your deployed Render backend URL (e.g. `https://zamora-backend.onrender.com`).
4. Deploy (or redeploy after setting `VITE_API_URL`, since Vite injects `VITE_*` variables at build time).
5. Copy your final Vercel URL (e.g. `https://zamora-frontend.vercel.app`) into `FRONTEND_URL` on Render so CORS and customer portal share links point to your live Vercel site.
