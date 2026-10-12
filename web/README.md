# AYUSH Central EPR — web

Next.js (App Router) + TypeScript + Tailwind CSS frontend. It replaces the old single-file `public.html`
and talks to the existing Express API in `../server` unchanged.

```
Browser -> Next.js :3000 --(rewrites /api/*)--> Express :4000 -> PostgreSQL
```

## Run

From the repo root: `npm run install:all` once, then `npm run dev` (API + web together).
Or separately: `npm run dev:api` and `npm run dev:web`.

`API_URL` (default `http://127.0.0.1:4000`) is read by `next.config.ts` when the app is built/started.

## Layout

| Path | What |
|---|---|
| `app/login` | Sign-in page with live server/DB health |
| `app/(app)/*` | Authenticated pages: reception, doctor, prescription, timeline, clinical, sessions, documents, billing, discharge, pharmacy, treatment-master, appointments, audit |
| `components/app-shell.tsx` | Header, sidebar, auth guard (redirects to `/login`) |
| `components/ui.tsx` | Shared form/table/card components |
| `lib/api.ts` | `fetch` wrapper: Bearer token from `sessionStorage`, 401 handling, upload, authenticated download |
| `lib/auth.tsx`, `lib/patient.tsx` | Session and "currently open patient" contexts |
| `lib/use-fetch.ts`, `lib/use-patient-data.ts` | Data-loading hooks used by the pages |
| `lib/types.ts` | Types for the API's JSON |

## Notes

- The patient you open in Reception stays selected across pages (and page reloads) until logout.
- Role enforcement is done by the API; pages show the API's error when a role isn't allowed.
