# Static demo: view-only preview for clients

A copy of the web app with **built-in fictional data and no backend**. It's plain HTML/JS/CSS, so any free
static host can serve it. Everything is view-only: save/upload buttons show "Demo mode: changes aren't saved".

## Build

```bash
cd web
npm install          # first time only
npm run build:demo   # writes the site to web/out  (about 2 MB)
```

Preview it locally: `npx serve out` and open the URL it prints.

## Host it for free (pick one)

| Host | How |
|---|---|
| **Netlify** | Open <https://app.netlify.com/drop> and drag the `web/out` folder onto the page. You get a link immediately. |
| **Cloudflare Pages** | Dashboard -> Workers & Pages -> Create -> Pages -> *Upload assets*, upload `web/out`. |
| **Vercel** | `cd web/out && npx vercel --prod` (the free Hobby plan is for non-commercial use; for client demos prefer Netlify or Cloudflare). |

Avoid GitHub Pages *project* sites: they serve from `/repo-name/`, which breaks the asset paths.

## Using the demo

- The login page has **"Explore the demo as..."** cards: one click signs in as each role (Super Admin, Medical
  Director, Doctor, Nurse, Therapist, Pharmacist, Reception, Finance, Manager, Auditor). Menus and dashboards
  change per role, using the same permission rules as the real app.
- Or type any demo username (`admin`, `doctor`, `reception`, ...) with the password **demo**.
- All people, patients and records are fictional. Dates are generated relative to today.

## Keeping it in sync

- Role permissions come from `server/permissions.js`. After changing them, run
  `npm --prefix server run export:permissions` and rebuild the demo.
- Sample data lives in `web/lib/demo/data.ts`.
- The site is public to anyone with the link. It contains no real data, but if you want to limit who can open it,
  use your host's access controls (for example Cloudflare Access).
