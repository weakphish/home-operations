# Monica CRM Deployment Design

**Date:** 2026-04-07
**Stack:** `pulumi/monica/`
**Status:** Approved

## Overview

Deploy Monica CRM (v5, Apache variant) on the homelab K8s cluster as a flat Pulumi TypeScript stack. Monica is a personal CRM for tracking relationships, birthdays, and follow-ups. It requires a MySQL-compatible database; we use MariaDB 10.11 LTS as a drop-in replacement.

## Architecture

Flat `index.ts` — no nested ComponentResource classes. Two tiers: MariaDB + Monica app. All resources in the `default` namespace, consistent with other app stacks.

```
Monica App (port 80)
    └── depends on → MariaDB Service (port 3306)
Tailscale Ingress → Monica Service → Monica App
```

## Resources

| Resource | Type | Details |
|---|---|---|
| `monica-db-claim` | Longhorn PVC | 5Gi, MariaDB data at `/var/lib/mysql` |
| MariaDB Deployment | `mariadb:10.11` | Recreate strategy |
| MariaDB Service | ClusterIP | Port 3306 |
| `monica-data-claim` | Longhorn PVC | 10Gi, Monica storage at `/var/www/html/storage` |
| Monica Deployment | `monicahq/monica:5` | Recreate strategy, port 80 |
| Monica Service | ClusterIP | Port 80 |
| Tailscale Ingress | `ingressClassName: tailscale` | `monica.pipefish-manta.ts.net` |
| K8s Secret | `monica-secret` | All sensitive values from Pulumi config |

## Secrets

Set via `pulumi config set --secret` before deploying. All three are pre-configured in the stack.

| Key | Description |
|---|---|
| `dbPassword` | MariaDB monica user password |
| `appKey` | Laravel APP_KEY (`base64:<32-byte-random>`) |
| `hashSalt` | 20+ char random string for ID obfuscation |

## Environment Configuration

**Non-secret (baked into Deployment):**
- `APP_ENV=production`
- `APP_DEBUG=false`
- `APP_URL=https://monica.pipefish-manta.ts.net`
- `DB_CONNECTION=mysql`
- `DB_HOST=<mariadb-service-name>`
- `DB_PORT=3306`
- `DB_DATABASE=monica`
- `DB_USERNAME=monica`
- `ALLOW_SIGNUP=true`
- `MAIL_MAILER=log` (stubs email to Laravel log, no SMTP required)

**From K8s Secret:**
- `APP_KEY` ← `appKey`
- `DB_PASSWORD` ← `dbPassword`
- `HASH_SALT` ← `hashSalt`

## Stack Ordering

Monica has no StackReference dependencies. It sits at position 11 in the deploy order (after `homebox`, before `satisfactory`). No other stacks reference it.

## Post-Deploy

Monica initializes its database schema automatically on first startup. Navigate to `https://monica.pipefish-manta.ts.net` to create the first user account.

Email is stubbed to `MAIL_MAILER=log` for now. When SMTP is configured later, add the relevant `MAIL_*` env vars to the Deployment and Secret.
