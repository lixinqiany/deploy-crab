# deploy-crab

English | [简体中文](README.zh-CN.md)

deploy-crab uses a TypeScript monorepo with a NestJS API, React + Vite frontend, shared UI components, pnpm, and Turborepo. The repository includes shared tooling, strict type checking, and standalone server builds.

## Quick start

Requires **Node.js >= 24.20.0** and **pnpm 11.24.0**. The tested Node.js version is recorded in [`.node-version`](.node-version).

Run these commands from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev:server
```

The API runs at <http://127.0.0.1:3000/api>.

Run `pnpm dev:web` in another terminal and open <http://127.0.0.1:5173>. Vite proxies `/api` to the backend.

## Structure

| Path                         | Purpose                                              |
| ---------------------------- | ---------------------------------------------------- |
| `apps/server`                | NestJS API, compiled with Rspack / SWC               |
| `packages/core`              | Node.js code shared by server and CLI, as TS source  |
| `packages/contracts`         | zod API schemas shared by server, web and CLI        |
| `packages/typescript-config` | Shared strict TypeScript settings                    |
| `packages/eslint-config`     | Shared ESLint rules, compatible with Prettier        |
| `scripts/build`              | Runtime dependency analysis and standalone packaging |

The frontend lives in `apps/web`; shared React components live in `packages/ui`. Keep browser-safe shared code separate from `core`, which uses Node.js APIs.

Development commands run type checks and lint alongside the application. VS Code includes a **Server: Debug** launch configuration.

## Build and deploy

```sh
pnpm build:server
```

Workspace code is bundled into `apps/server/dist`. The directory includes runtime metadata, a pruned lockfile, source maps, and application assets when present. The build preserves the source lockfile and its resolved versions.

Use `pnpm start:server` to run the build locally. For deployment, copy the entire `dist` directory to the target and run inside it:

```sh
pnpm install --prod --frozen-lockfile
pnpm start
```

Only Node.js and pnpm are required on the target.

`pnpm build:web` produces static files in `apps/web/dist`. Serve them with a static web server and route `/api` to the backend. `pnpm start:web` provides a local preview.

## Configuration

- `PORT`: API port; defaults to `3000`.
- `--data-dir <path>`: data directory. Defaults to `~/.deploy-crab/`; `pnpm dev:server` passes `--data-dir ../../.deploy-crab`, so development data stays in the repository root. Relative paths resolve from the working directory, e.g. `pnpm start -- --data-dir /srv/deploy-crab`.
- `WEB_PORT`: frontend port; defaults to `5173`. Set the same `PORT` for both development processes when changing the API port.

See the [server guide](apps/server/README.md) and [build documentation](scripts/README.md) for details (Chinese).

## Validation

```sh
pnpm exec turbo run build check-types lint
pnpm exec prettier --check .
pnpm --filter @deploy-crab/server test
pnpm --filter @deploy-crab/server test:e2e
```

## License

[MIT](LICENSE) © lixinqiany
