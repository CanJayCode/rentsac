# Rentsac

Phone-first rent and light-bill app for a 16-room building (English and Marathi). Next.js, Tailwind, Supabase, Vitest.

To set it up for real use, follow [docs/SETUP.md](docs/SETUP.md).

## Scripts

- `npm run dev` start the app (http://localhost:3000)
- `npm run build` production build
- `npm test` run the tests
- `npm run lint` lint
- `npm run check:db` read-only check that the Supabase database is set up (needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`)
- `npm run import -- <file.xlsx> --dry-run` one-time meter-readings import from Excel (see SETUP.md, step 5)

## Local mode without a database

Set `REPO=memory` to run with a throwaway in-memory store (data is lost on restart):

```powershell
$env:REPO="memory"; npm run dev
```

Other settings go in `.env.local`. Never commit that file.
