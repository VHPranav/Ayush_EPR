# Static demo: view-only preview for clients

A copy of the web app with **built-in fictional data and no backend**. It's plain HTML/JS/CSS, so any free
static host can serve it. Everything is view-only: save/upload buttons show "Demo mode: changes aren't saved".

## Build

```bash
cd web
npm install          # first time only
npm run build:demo   # writes the site to web/out-demo  (about 2 MB)
```

Preview it locally: `npx serve out-demo` and open the URL it prints.

The demo is built into its own folder (`web/out-demo`), so it never overwrites the `.next` folder a running
`npm run dev` uses.

## Deploy to Cloudflare in one command

From the repo root:

```bash
npx wrangler@4 login     # first time only: opens your browser, click Allow
npm run deploy:demo      # builds the demo, then uploads it
```

Live site: <https://ayush-epr-demo.pranavvh778.workers.dev>

- The Cloudflare settings live in `deploy/cloudflare/wrangler.jsonc` (a Worker that serves the static files).
  Wrangler is pointed at that file explicitly, so it can't auto-modify the app. Don't run `wrangler` bare inside `web/`:
  it detects Next.js and tries to rewrite the project for Workers.
- If your Cloudflare login has more than one account, set `CLOUDFLARE_ACCOUNT_ID=<id>` first.
- To use another name or a custom domain, edit `deploy/cloudflare/wrangler.jsonc`.

## Host it somewhere else (free options)

| Host | How |
|---|---|
| **Netlify** | Open <https://app.netlify.com/drop> and drag the `web/out-demo` folder onto the page. You get a link immediately. |
| **Cloudflare Pages** | Dashboard -> Workers & Pages -> Create -> Pages -> *Upload assets*, upload `web/out-demo`. |
| **Vercel** | `cd web/out-demo && npx vercel --prod` (the free Hobby plan is for non-commercial use; for client demos prefer Netlify or Cloudflare). |

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
