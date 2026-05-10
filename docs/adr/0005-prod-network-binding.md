# 0005 — Production stack binds non-public services to `127.0.0.1`, fronted by nginx

**Status**: Accepted

## Context

Docker Compose's `"6379:6379"` port shorthand binds the host side to `0.0.0.0:6379` — i.e. all network interfaces, public internet included. On a developer laptop behind a router this is fine. On a real VPS with a public IP it is the well-known way to get your Redis (or worse, your Postgres) trawled by scanners and emptied by ransomware bots, especially since:

- The default Redis image we use has no authentication configured.
- Redis ships with `CONFIG SET dir` and `BGSAVE` enabled by default, which combined with the lack of auth gives a remote caller a full RCE primitive.

A firewall in front would mitigate this. We chose not to rely on the firewall as the only line of defense.

## Decision

Only `nginx` binds to all interfaces on the host. Every other service that *needs* host-side reachability (so SSH'd-in operators can run `pnpm health:check` and `pnpm queue:verify`) binds to `127.0.0.1` explicitly:

| Service    | Host port mapping                  |
| ---------- | ---------------------------------- |
| `nginx`    | `80:80` (public)                   |
| `web`      | `127.0.0.1:3000:3000` (host only)  |
| `redis`    | `127.0.0.1:6379:6379` (host only)  |
| `postgres` | (not published — compose network only) |

Public traffic flows: client → `nginx:80` → (compose network) → `web:3000`. Nothing else has an internet-reachable surface.

## Consequences

- A VPS firewall is now defense-in-depth, not the only defense.
- Host-side operator scripts still work: `pnpm health:check` and `pnpm queue:verify` resolve `localhost:3000` and `localhost:6379` against the loopback-bound publishes.
- TLS is a separate concern. Compose ships nginx HTTP-only; production deployers add a `server { listen 443 ssl ... }` block referencing certbot output, or replace nginx with Caddy/Traefik for automated Let's Encrypt. Cloudflare in front is also valid.
- `POSTGRES_PASSWORD` is still important even though Postgres isn't published — it gates access from any other container that joins the compose network later, and from `psql` shells inside the `postgres` container itself. See README's gotchas for the "must set before first `docker compose up`" caveat (the credential is locked into the data volume on first init).
