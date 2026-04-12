# AGENTS.md

This repository is a production-grade TypeScript and React user interface for the Logos ecosystem. It talks to the Logos backend over HTTP, not to databases directly.

## Primary goals
- correctness
- maintainability
- operational safety
- observability
- secure defaults
- stable user-visible behavior

## Required working style
- Make the smallest safe change that fully solves the task.
- Follow existing component, hook, and module patterns before introducing new ones.
- Prefer platform APIs and intentional dependencies over ad hoc solutions.
- Keep route and page components thin; put logic in hooks, services, and feature modules.
- Preserve backward compatibility with the API unless explicitly asked to break it.

## TypeScript expectations
- Avoid `any` unless absolutely necessary; use `unknown` at boundaries and narrow.
- Avoid side effects during render; use effects, handlers, or data libraries deliberately.
- Model loading, error, and empty states explicitly for async flows.
- Prefer table-driven tests where they improve clarity.

## Deployment expectations
- Cache hashed static assets aggressively; avoid caching `index.html` in ways that strand users on broken chunk graphs.
- Never embed secrets in client bundles.
- Use HTTPS and secure cookie attributes when using cookie-based sessions.

## API integration expectations
- Align types and parsing with the backend contract; treat the server as the source of truth for persisted data.
- Cancel or ignore stale in-flight requests when inputs or routes change.
- Map API errors to stable UI outcomes; never leak tokens or raw internals to users.

## Observability expectations
- Use structured client logging or RUM where the platform provides it.
- Correlate with backend traces when request IDs are available.
- Never log secrets, tokens, passwords, or unnecessary personal data.

## Change checklist
Before finishing:
- types and imports are correct
- tests were added or updated where needed
- no obvious security or accessibility regression was introduced
- no obvious deploy, cache, or API compatibility risk was introduced
- docs were updated if behavior changed
