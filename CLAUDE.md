# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## IMPORTANT INSTRUCTIONS!!
Every time you make a change, ensure that you:
1. Update the README architecture diagram
2. Update `CLAUDE.md` 

to both be up to date with the changes, if neccesary.

## Repository Overview

This is a self-hosted infrastructure repository using Pulumi for Infrastructure-as-Code (IaC) and Ansible for K3s cluster bootstrapping. The primary use case is running a Foundry VTT server for D&D sessions, exposed via Cloudflare Tunnel with Zero Trust authentication.

## Development Commands

### Ansible (K3s Cluster Bootstrap)

```bash
# Bootstrap K3s cluster on the server
cd ansible
ansible-playbook playbook.yml -i inventory.yml -kK

# Note: May require export ANSIBLE_BECOME_EXE=sudo.ws due to Ansible issue #85837
export ANSIBLE_BECOME_EXE=sudo.ws
```

### Pulumi (Microstack Management)

Each microstack is deployed independently. Navigate to the desired stack directory first.

```bash
# Common workflow for any microstack
cd pulumi/<stack-name>

# Install dependencies (if needed)
npm install

# Preview changes
pulumi preview --stack homelab

# Deploy changes
pulumi up --stack homelab

# View stack outputs
pulumi stack output --stack homelab

# Destroy stack
pulumi destroy --stack homelab
```

Example deploying Foundry:
```bash
cd pulumi/foundry
pulumi up --stack homelab
```

### TypeScript Development

```bash
# Compile TypeScript
cd pulumi
npx tsc

# Type check
npx tsc --noEmit
```

## Architecture

### Dual Network Strategy

- **Cloudflare Tunnel**: Public access for specific applications (Foundry VTT) with Zero Trust authentication
- **Tailscale**: Private access for administrative tasks and all other services

### Microstack Organization

Infrastructure is organized as independent **microstacks**, each responsible for one area of the system:

1. **cf-tunnel** (pulumi/cf-tunnel/):
   - Manages Cloudflare Tunnel and DNS records
   - Creates Zero Trust Access Application with email-based policies
   - Stores tunnel token as a Kubernetes Secret for cloudflared

2. **cf-k8s** (pulumi/cf-k8s/):
   - K3s cluster initialization and core K8s resources
   - Foundational networking setup

3. **tailscale** (pulumi/tailscale/):
   - Deploys Tailscale Kubernetes Operator
   - Enables private network access to internal services via Ingress

4. **foundry** (pulumi/foundry/):
   - Foundry VTT virtual tabletop deployment
   - Secrets for Foundry credentials
   - PersistentVolume at `/home/jack/foundrydata` (50Gi)
   - Service exposing NodePort 30000
   - felddy/foundryvtt image deployment

5. **glance** (pulumi/glance/):
   - Glance Dashboard deployment
   - Dashboard application for administrative overview
   - Tailscale Ingress access

6. **monitoring** (pulumi/monitoring/):
   - kube-prometheus-stack with Prometheus and Grafana
   - Metrics collection from cluster and applications
   - 10Gi Grafana persistence
   - 15-day Prometheus retention

7. **satisfactory** (pulumi/satisfactory/):
   - Satisfactory game server deployment
   - PersistentVolume at `/home/jack/satisfactory` (30Gi)
   - Game server configuration via environment variables

### Deployment Process

Each microstack is deployed independently:
```bash
cd pulumi/<stack-name>
pulumi up --stack homelab
```

Stacks should typically be deployed in order:
1. cf-k8s (foundation)
2. cf-tunnel (external access)
3. tailscale (internal access)
4. foundry, glance, monitoring, satisfactory (applications)

### Ansible Structure

The Ansible playbook:
- Imports the k3s-io/k3s-ansible collection playbook for cluster setup
- Installs additional dependencies like Helm
- Uses inventory.yml to define the cluster (single server node: "new-bermuda")
- Automatically merges kubeconfig for kubectl access

## Important Details

### Storage

All applications use local PersistentVolumes with Retain reclaim policy on node "new-bermuda":

- **Foundry**: `/home/jack/foundrydata` (50Gi)
- **Satisfactory**: `/home/jack/satisfactory` (30Gi)
- **Grafana**: Persistence enabled (10Gi)

All PVs have node affinity constraints to ensure they stay on "new-bermuda".

### Networking

- **Public Access**: Cloudflare Tunnel routes `foundry.<domain>` to Cloudflared pods via NodePort 30000
  - Zero Trust policy restricts to whitelisted email addresses
- **Internal Access**: Tailscale Operator provides private Ingress to:
  - Foundry (also accessible via CF for public users)
  - Glance Dashboard
  - Satisfactory Server
  - Grafana (monitoring dashboard)

### K3s Configuration

- Single server node setup (node name: "new-bermuda")
- K3s version specified in ansible/inventory.yml
- KUBECONFIG automatically configured for the ansible_user
- Can be extended to include agent nodes in the future

### Recent Architecture Changes

- **Microstack Migration**: Infrastructure was previously monolithic; now split into independent stacks
- **New Monitoring**: Prometheus + Grafana stack added for metrics collection
- **New Gaming**: Satisfactory game server added for multiplayer gameplay
- **Independent Deployments**: Each stack can be deployed/updated separately without affecting others
