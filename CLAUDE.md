# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## IMPORTANT INSTRUCTIONS!!
Every time you make a change, ensure that you:
1. Update the README architecture diagram
2. Update `CLAUDE.md`

to both be up to date with the changes, if necessary.

When debugging or gathering cluster state, **run `kubectl` and other shell commands yourself** via the Bash tool rather than asking the user to run them.

## Repository Overview

This is a self-hosted infrastructure repository using:
- **Pulumi** for cloud API resources (Cloudflare tunnel/DNS/Zero Trust, Tailscale ACL/settings) **and all in-cluster K8s app workloads**
- **Ansible** for K3s cluster bootstrapping

The primary use case is running a Foundry VTT server for D&D sessions, exposed via Cloudflare Tunnel with Zero Trust authentication.

## Development Commands

### Ansible (K3s Cluster Bootstrap)

```bash
cd ansible
ansible-playbook playbook.yml -i inventory.yml -kK

# Note: May require export ANSIBLE_BECOME_EXE=sudo.ws due to Ansible issue #85837
export ANSIBLE_BECOME_EXE=sudo.ws
```

### Pulumi (All K8s Workloads + Cloud API Resources)

```bash
cd pulumi/<stack-name>
npm install           # if needed
pulumi preview --stack homelab
pulumi up --stack homelab
```

See the Pulumi Stacks section in Architecture for the full stack list and deploy order.

### Shared TypeScript Library

`pulumi/lib/k8s.ts` contains helpers shared across stacks. Import via relative path:

```typescript
import { makeTailscaleIngress, makeLonghornPVC, SERVICE_IGNORE_CHANGES } from "../lib/k8s";
```

Each stack's `tsconfig.json` sets `baseUrl: "."` and `paths: { "@pulumi/*": ["./node_modules/@pulumi/*"] }` so TypeScript resolves `@pulumi/*` imports inside `lib/k8s.ts` using the consuming stack's own `node_modules`. The lib has no `package.json` of its own.

**Important:** `tsconfig` `paths` only affects the TypeScript compiler — the Node.js runtime resolves modules by walking up the directory tree from the file's location. Because `lib/k8s.ts` lives at `pulumi/lib/`, Node looks for `node_modules` at `pulumi/lib/`, `pulumi/`, etc. — never inside a stack subdirectory. To fix this, `pulumi/node_modules/@pulumi/` contains symlinks into `pulumi/paperless/node_modules/@pulumi/` so all stacks can resolve the shared lib at runtime. If you add a new stack, ensure these symlinks are still valid.

### TypeScript Development (Pulumi)

```bash
# Type check a single stack
cd pulumi/<stack-name>
npm install
npx tsc --noEmit

# Deploy in dependency order
cd pulumi/loki && pulumi up --stack homelab
cd pulumi/kube-prometheus-stack && pulumi up --stack homelab
cd pulumi/grafana && pulumi up --stack homelab
cd pulumi/alloy && pulumi up --stack homelab
```

## Architecture

### Dual Network Strategy

- **Cloudflare Tunnel**: Public access for Foundry VTT with Zero Trust authentication
- **Tailscale**: Private access for all other services

### IaC Split

| Layer | Tool | Manages |
|-------|------|---------|
| Cloud APIs | Pulumi | CF tunnel/DNS/ZT, Tailscale ACL/DNS/HTTPS |
| K8s workloads | Pulumi | All app deployments, services, ingresses, secrets, PVCs |
| Cluster bootstrap | Ansible | K3s install, kubeconfig |

### Pulumi Stacks

All stacks use org `weakphish`, stack name `homelab`. Deploy in this order (respects StackReference dependencies):

```
cf-tunnel → cloudflared
loki → alloy, grafana
kube-prometheus-stack → grafana
```

#### Cloud API stacks

1. **cf-tunnel** (`pulumi/cf-tunnel/`):
   - Cloudflare Tunnel, DNS CNAME records, Zero Trust Access Application
   - Email allowlist policy for Foundry
   - Stores tunnel token as a Kubernetes Secret for cloudflared
   - Exports: `tunnelTokenSecretName`, `tunnelSecret`

2. **cf-k8s** (`pulumi/cf-k8s/`):
   - K3s cluster initialization and core K8s resources

3. **tailscale** (`pulumi/tailscale/`):
   - Tailscale ACL: admin user gets full access, all other members restricted to Satisfactory (port 7777)
   - MagicDNS and HTTPS certificate provisioning enabled

#### K8s infrastructure stacks

4. **longhorn** (`pulumi/longhorn/`):
   - Longhorn HelmRelease in `longhorn-system` namespace, `defaultReplicaCount: 1`
   - Tailscale Ingress at `longhorn.pipefish-manta.ts.net`

5. **tailscale-operator** (`pulumi/tailscale-operator/`):
   - Tailscale Kubernetes operator HelmRelease in `tailscale` namespace
   - Config secrets: `clientId`, `clientSecret`

6. **network-policies** (`pulumi/network-policies/`):
   - Default-deny Ingress+Egress NetworkPolicy for `default` namespace
   - Allow-DNS-egress NetworkPolicy (UDP/TCP 53) for all pods

#### App stacks (all `default` namespace)

7. **cloudflared** (`pulumi/cloudflared/`): StackRef → cf-tunnel; CF tunnel daemon Deployment
8. **foundry** (`pulumi/foundry/`): Longhorn PVC 50Gi, Recreate Deployment, Service:30000, Tailscale Ingress; config secrets: `foundryUsername`, `foundryPassword`, `licenseKey`, `adminKey`
9. **homepage** (`pulumi/homepage/`): RBAC + ConfigMap (all 7 config files) + Deployment + Tailscale Ingress
10. **donetick** (`pulumi/donetick/`): Longhorn PVC 10Gi, Recreate Deployment, Tailscale Ingress; config secret: `jwtSecret`
11. **satisfactory** (`pulumi/satisfactory/`): Longhorn PVC 25Gi, Recreate Deployment, Tailscale LoadBalancer Service (TCP+UDP 7777, TCP 8888)
12. **paperless** (`pulumi/paperless/`): Nested components — `PaperlessDatabase` (postgres:16.12), `PaperlessCache` (redis:7.4.7), `PaperlessApp` (web+worker+scheduler); Longhorn PVCs; Tailscale Ingress; config secrets: `dbPassword`, `secretKey`, `adminUser`, `adminPassword`, `adminEmail`

#### Monitoring stacks (all `default` namespace)

13. **kube-prometheus-stack** (`pulumi/kube-prometheus-stack/`): prometheus-community chart v82.15.1, scrapeInterval=30s, grafana disabled; exports `prometheusServiceUrl`, `alertmanagerServiceUrl`
14. **loki** (`pulumi/loki/`): grafana-community/loki v9.3.3, SingleBinary, filesystem storage, 168h retention, TSDB schema v13; exports `lokiServiceUrl`
15. **alloy** (`pulumi/alloy/`): StackRef → loki; grafana/alloy v1.6.2 DaemonSet, River config for pod log tailing + K8s events → Loki
16. **grafana** (`pulumi/grafana/`): StackRefs → kube-prometheus-stack + loki; grafana-community/grafana v11.3.6, sidecar datasource/dashboard discovery, Longhorn PVC 10Gi, Tailscale Ingress; config secrets: `adminUser`, `adminPassword`

All HTTP apps use **Tailscale Ingress** (`ingressClassName: tailscale`) at `*.pipefish-manta.ts.net`. Satisfactory uses Tailscale LoadBalancer instead (UDP incompatible with Ingress).

### Ansible Structure

- Imports k3s-io/k3s-ansible collection for cluster setup
- Installs Helm (apt for Ubuntu)
- Cluster: single node — server `new-bermuda` (control plane only)

## Important Details

### Storage

All PVCs use Longhorn dynamic provisioning (`storageClassName: longhorn`).

| App | PVC Name | Size |
|-----|----------|------|
| Foundry | foundry-data-claim | 50Gi |
| Paperless data | paperless-data-claim | 10Gi |
| Paperless media | paperless-media-claim | 50Gi |
| Paperless consume | paperless-consume-claim | 10Gi |
| Paperless postgres | paperless-postgres-claim | 10Gi |
| Paperless redis | paperless-redis-claim | 1Gi |
| Donetick | donetick-data-claim | 10Gi |
| Satisfactory | satisfactory-claim | 25Gi |
| Grafana | (Helm-managed) | 10Gi |
| Loki | (Helm-managed) | 20Gi |

### Networking

- **Public**: Cloudflare Tunnel → `foundry.<domain>` → cloudflared → foundry:30000
  - Zero Trust policy: whitelisted emails only
- **Private**: Tailscale Ingress (HTTPS) for all HTTP services; UDP LoadBalancer for Satisfactory

Tailscale services at `*.pipefish-manta.ts.net`:
- foundry, homepage, grafana, paperless, donetick
- Prometheus/Alertmanager: internal only (bundled in kube-prometheus-stack, no Tailscale ingress)
- Loki: internal only (log storage, no Tailscale ingress)
- Satisfactory: UDP LoadBalancer (game ports incompatible with Ingress)

### K3s Configuration

- **new-bermuda**: Single-node cluster (K3s server, Ubuntu) — control plane and workloads

### Namespace Strategy

- `default`: all app workloads
- `tailscale`: Tailscale operator (Helm chart requirement)
- `longhorn-system`: Longhorn storage
- `kube-system`: system components

### Secrets Management

Secrets are managed via Pulumi config: `pulumi config set --secret <key> <value>` and accessed with `config.requireSecret()` in TypeScript. Encrypted in Pulumi state (backend: Cloudflare R2). SOPS/Age and `scripts/preflight.py` are no longer used.

### Recent Architecture Changes

- **Pulumi Migration**: All K8s app workloads migrated from Flux CD GitOps to Pulumi TypeScript microstacks. Flux fully uninstalled. Secrets now use `config.requireSecret()` (Pulumi encrypted state) rather than SOPS/Age.
- **Tailscale Operator**: Moved to dedicated `pulumi/tailscale-operator/` stack.
- **Longhorn**: Dedicated `pulumi/longhorn/` stack. All PVCs now use Longhorn dynamic provisioning.
- **All Storage → Longhorn**: Previously most PVCs used hostPath (`storageClassName: manual`); all now use Longhorn.
- **Network Policies**: Dedicated `pulumi/network-policies/` stack — default-deny + allow-DNS for `default` namespace.
- **Tailscale Ingress Default**: All HTTP apps use `ingressClassName: tailscale`. Satisfactory uses Tailscale LoadBalancer.
- **Monitoring Stack**: `kube-prometheus-stack` (Prometheus Operator + Prometheus + Alertmanager) + Loki (SingleBinary, filesystem, 7-day retention) + Alloy (DaemonSet log collector) + Grafana (sidecar datasource/dashboard discovery via ConfigMap labels).
- **Single-Node Cluster**: new-bermuda is the sole node (control plane + workloads).
- **Namespace Consolidation**: All app workloads in `default` namespace.
