# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## IMPORTANT INSTRUCTIONS!!
Every time you make a change, ensure that you:
1. Update the README architecture diagram
2. Update `CLAUDE.md`

to both be up to date with the changes, if necessary.

## Repository Overview

This is a self-hosted infrastructure repository using:
- **Pulumi** for cloud API resources (Cloudflare tunnel/DNS/Zero Trust, Tailscale ACL/settings)
- **Flux CD** for all in-cluster K8s app workloads (GitOps, SOPS-encrypted secrets)
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

### Pulumi (Cloud API Resources)

Only three stacks remain — these manage cloud API resources, not K8s workloads.

```bash
cd pulumi/<stack-name>
npm install           # if needed
pulumi preview --stack homelab
pulumi up --stack homelab
```

Stacks:
- `cf-k8s` — K3s cluster init and core K8s resources
- `cf-tunnel` — Cloudflare tunnel, DNS, Zero Trust access application
- `tailscale` — Tailscale ACL, MagicDNS, HTTPS settings (operator is managed by Flux)

### Flux CD (App Workloads)

All app workloads are managed via GitOps. Push changes to the `main` branch and Flux reconciles.

```bash
# Check Flux status
flux get all

# Force immediate reconciliation
flux reconcile kustomization flux-system --with-source

# View logs for a specific app
flux logs --kind=HelmRelease --name=<app>

# Suspend/resume reconciliation
flux suspend kustomization <app>
flux resume kustomization <app>
```

Secrets are SOPS-encrypted with Age. To re-export secrets from Pulumi:
```bash
SOPS_AGE_KEY_FILE=~/.config/sops/age/keys.txt python3 scripts/preflight.py
```

### TypeScript Development (Pulumi)

```bash
cd pulumi
npx tsc --noEmit   # type check
```

## Architecture

### Dual Network Strategy

- **Cloudflare Tunnel**: Public access for Foundry VTT with Zero Trust authentication
- **Tailscale**: Private access for all other services

### IaC Split

| Layer | Tool | Manages |
|-------|------|---------|
| Cloud APIs | Pulumi | CF tunnel/DNS/ZT, Tailscale ACL/DNS/HTTPS |
| K8s workloads | Flux CD | All app deployments, services, ingresses, secrets, PVs |
| Cluster bootstrap | Ansible | K3s install, kubeconfig |

### Pulumi Microstacks

1. **cf-tunnel** (`pulumi/cf-tunnel/`):
   - Cloudflare Tunnel, DNS CNAME records, Zero Trust Access Application
   - Email allowlist policy for Foundry
   - Stores tunnel token as a Kubernetes Secret for cloudflared

2. **cf-k8s** (`pulumi/cf-k8s/`):
   - K3s cluster initialization and core K8s resources

3. **tailscale** (`pulumi/tailscale/`):
   - Tailscale ACL: admin user gets full access, all other members restricted to Satisfactory (port 7777)
   - MagicDNS and HTTPS certificate provisioning enabled
   - **Note**: Tailscale Kubernetes operator is managed by Flux, not Pulumi

### Flux Apps (`flux/apps/`)

All apps deploy to the `default` namespace unless noted:

All HTTP apps use **Tailscale Ingress** (`ingressClassName: tailscale`) by default for private HTTPS access. Satisfactory is the only exception (UDP LoadBalancer).

| App | Type | Tailscale URL | Notes |
|-----|------|--------------|-------|
| tailscale | HelmRelease | — | Operator in `tailscale` namespace |
| longhorn | HelmRelease | `longhorn.pipefish-manta.ts.net` | Block storage, `longhorn-system` namespace, `defaultReplicaCount: 1` |
| foundry | Deployment | `foundry.pipefish-manta.ts.net` | Also via CF tunnel |
| homepage | Deployment | `homepage.pipefish-manta.ts.net` | K8s cluster discovery |
| monitoring | HelmRelease | `grafana/prometheus/alertmanager.pipefish-manta.ts.net` | kube-prometheus-stack |
| paperless | Deployment | `paperless.pipefish-manta.ts.net` | web + worker + scheduler + postgres + redis |
| satisfactory | Deployment | UDP LoadBalancer | infinite-granite node, NoSchedule taint |
| donetick | Deployment | `donetick.pipefish-manta.ts.net` | SQLite, single container |

### Flux Bootstrap

```bash
kubectl create namespace flux-system
kubectl create secret generic sops-age \
  --namespace=flux-system \
  --from-file=age.agekey=$HOME/.config/sops/age/keys.txt

flux bootstrap github \
  --owner=weakfish \
  --repository=self-hosted \
  --branch=main \
  --path=flux/flux-system \
  --personal
```

### Ansible Structure

- Imports k3s-io/k3s-ansible collection for cluster setup
- Disables UFW on agent nodes (flannel VXLAN UDP 8472)
- Installs Helm (apt for Ubuntu, pacman for Arch)
- Cluster: server `new-bermuda`, agent `infinite-granite`
- Agent taint configured via `agent_config_yaml` in inventory.yml

## Important Details

### Storage

All storage uses hostPath (`storageClassName: manual`) — node-pinned to new-bermuda, except Satisfactory which is on infinite-granite.

| App | Size | Path |
|-----|------|------|
| Foundry | 50Gi | `/home/jack/foundrydata` |
| Paperless data | 10Gi | `/home/jack/paperless/data` |
| Paperless media | 50Gi | `/home/jack/paperless/media` |
| Paperless consume | 10Gi | `/home/jack/paperless/consume` |
| Paperless postgres | 10Gi | `/home/jack/paperless/postgres` |
| Paperless redis | 1Gi | `/home/jack/paperless/redis` |
| Donetick | 10Gi | `/home/jack/donetick/data` |
| Portainer | 10Gi | `/home/jack/portainer/data` |
| Satisfactory | 30Gi | `/home/jack/Applications/satisfactory` (infinite-granite) |
| Grafana | 10Gi | Longhorn (dynamic) |

### Networking

- **Public**: Cloudflare Tunnel → `foundry.<domain>` → cloudflared → foundry:30000
  - Zero Trust policy: whitelisted emails only
- **Private**: Tailscale Ingress (HTTPS) for all HTTP services; UDP LoadBalancer for Satisfactory

Tailscale services at `*.pipefish-manta.ts.net`:
- foundry, homepage, grafana, prometheus, alertmanager, paperless, donetick
- Satisfactory: UDP LoadBalancer (game ports incompatible with Ingress)

### K3s Configuration

- **new-bermuda**: Control plane (K3s server, Ubuntu)
- **infinite-granite**: Agent node (K3s agent, CachyOS) — local gaming workstation
- Taint: `role=gaming-workstation:NoSchedule` on infinite-granite — only Satisfactory schedules there
- UFW disabled on agent nodes via Ansible

### Namespace Strategy

- `default`: all app workloads
- `tailscale`: Tailscale operator (Helm chart requirement)
- `portainer`: Portainer (convention)
- `kube-system`: system components
- `flux-system`: Flux CD controllers

### Secrets Management

Secrets are SOPS-encrypted with Age key at `~/.config/sops/age/keys.txt`. Rules in `.sops.yaml` cover `flux/apps/*/secret.yaml`. Run `scripts/preflight.py` to re-export from Pulumi and re-encrypt.

### Recent Architecture Changes

- **Flux CD Migration**: All K8s app workloads migrated from Pulumi microstacks to Flux CD GitOps. Pulumi now manages only cloud API resources (CF tunnel, Tailscale ACL/settings).
- **SOPS Secrets**: App secrets encrypted at rest in Git with Age/SOPS. `scripts/preflight.py` exports from Pulumi and encrypts.
- **Tailscale Operator**: Moved from Pulumi tailscale stack to Flux HelmRelease.
- **Longhorn Restored**: Longhorn re-added as a Flux HelmRelease in `longhorn-system`. `defaultReplicaCount: 1` (single storage node). Grafana and Prometheus PVCs use Longhorn dynamic provisioning.
- **Portainer Removed**: Removed from cluster.
- **Dashdot Removed**: Removed from cluster.
- **Tailscale Ingress Default**: All HTTP apps use `ingressClassName: tailscale`. Satisfactory retains UDP LoadBalancer.
- **Glance → Homepage**: Replaced with Homepage dashboard using K8s cluster discovery mode.
- **Vikunja → Donetick**: Replaced with Donetick (SQLite, single container, simpler).
- **Two-Node Cluster**: new-bermuda (control plane) + infinite-granite (agent, NoSchedule taint).
- **Namespace Consolidation**: All app workloads in `default` namespace.
