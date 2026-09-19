# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

Wails v3 (beta) desktop app scaffold, generated from the standard Wails3 template. The Go side is still the template's `GreetService` demo and the frontend is a placeholder `App.tsx`; `README.md` is the unmodified Wails boilerplate and describes nothing project-specific. `go.mod` still declares `module changeme`, which is why generated bindings live under `frontend/bindings/changeme/`.

## Commands

All build orchestration goes through Task, and `task` is not on PATH here — invoke tasks through the wails3 shim:

```bash
wails3 dev                    # hot-reload dev mode (backend + Vite) on port 9245
wails3 build                  # native build → bin/EasyCLIProxyAPI
wails3 task run               # build + run the current platform's binary
wails3 task darwin:package:dmg
wails3 task build:server      # GUI-less HTTP server binary → bin/EasyCLIProxyAPI-server
wails3 task generate:bindings # regenerate frontend/bindings from Go services
wails3 task --list            # all tasks
```

Frontend-only work (from `frontend/`): `npm run dev`, `npm run build`, `npm run build:dev`, `npm run preview`. There is no lint or test setup in this repo — no test files, no linter config, and no `test` script.

Vite is pinned to `127.0.0.1:9245` with `strictPort`; override with `WAILS_VITE_PORT`, which the root Taskfile threads through to both `wails3 dev` and the Vite server.

## Build gotcha

`main.go` embeds `//go:embed all:frontend/dist`, so a bare `go build ./...` or `go vet ./...` fails with `pattern all:frontend/dist: no matching files found` until the frontend has been built at least once. Run `npm run build` (or any `wails3 task` that depends on `build:frontend`) first. `frontend/dist` is gitignored but present in a working checkout.

## Architecture

Two layers, connected by generated bindings rather than hand-written IPC:

1. **Go backend** — `main.go` builds the `application.Options` (window geometry, macOS translucent backdrop, `ApplicationShouldTerminateAfterLastWindowClosed`) and registers services via `application.NewService(&SomeService{})`. Any exported method on a registered service struct (`greetservice.go` is the example) is callable from the frontend. Adding a Go service means editing `main.go` **and** rerunning binding generation.
2. **React frontend** — Vite + React 18 + TypeScript in `frontend/`, entry `src/main.tsx` → `src/App.tsx`. Import Go methods from the generated `frontend/bindings/`: `import { Greet } from "../bindings/changeme"` returns a `CancellablePromise`. Never hand-edit `frontend/bindings/` — it is regenerated with `-clean=true`, which deletes the directory first.

`frontend/public/` assets (fonts, backgrounds, `style.css`) are served as-is and copied into `dist/`; `style.css` is loaded from `index.html` as an absolute `/style.css` link.

## Build system layout

- `Taskfile.yml` (root) — thin dispatcher. `GOOS` defaults to the host OS and selects which platform Taskfile under `build/` implements `build` / `package` / `run`.
- `build/Taskfile.yml` — platform-agnostic tasks: frontend build, binding generation, server and Docker builds. `build/{darwin,windows,linux,ios,android}/Taskfile.yml` implement platform specifics; `build/docker/` holds the server and cross-compilation Dockerfiles.
- `build/config.yml` — app metadata and dev-mode watch config. It says `update:build-assets` overwrites generated assets and warns to rerun it after changing `info` or `fileAssociations`.
- `build:frontend` and `generate:bindings` are both `run: once` deliberately (see the inline comments): parallel per-arch builds race on `go mod tidy` and on binding regeneration otherwise. Binding generation hashes `**/*.go` and `go.mod`/`go.sum`, so a backend-only change triggers it automatically during a build.
