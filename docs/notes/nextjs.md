# Next.js notes (cached 2026-11-06, Next 16.4, React 19.3)

- App Router: `src/app/**/page.tsx` are routes and `layout.tsx` wraps them. Dynamic segments look like `[id]`. In Next 15+ `params` is a **Promise**: `({ params }: { params: Promise<{ id: string }> })`, then `const { id } = await params`.
- Route handlers: `app/api/.../route.ts` exporting `GET`/`POST(request)`. We don't use them. Our backend is `services/backend`.
- Env: `NEXT_PUBLIC_*` values are **inlined at build time** into the browser bundle, and only literal `process.env.NEXT_PUBLIC_X` reads get inlined (no dynamic lookups). Changing them requires a rebuild. Never put secrets in `NEXT_PUBLIC_*`.
- Load order: `process.env`, `.env.$NODE_ENV.local`, `.env.local` (skipped in test), `.env.$NODE_ENV`, `.env`. Env files live in the app root (`apps/web/`), not in `src/`.
- Runtime env on the server: call `await connection()` (from `next/server`) before reading `process.env` in dynamic server components.
- Workspace TS packages: set `transpilePackages: ["@invoiceagent/shared"]` in `next.config.ts`, because shared exports raw `.ts`.
- Tailwind v4: `postcss.config.mjs` with `@tailwindcss/postcss`, plus `@import "tailwindcss"` in `globals.css` (see design.md).

## Our env (apps/web)
- `NEXT_PUBLIC_BACKEND_URL`: backend base URL.
- `NEXT_PUBLIC_MOCK=1`: serve fixtures from `@invoiceagent/shared` instead of calling the backend. Must be OFF in production.

## zod (zod.dev, v4)
- `z.object`, `z.enum([...] as const)`, `z.array`, `z.url()`, `z.custom<T>(fn)`. Use `.parse` (throws) or `.safeParse` (returns `{ success, data | error }`). `satisfies z.ZodType<T>` keeps schemas in line with the TS types.
