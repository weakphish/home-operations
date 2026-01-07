# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

### Pulumi (Infrastructure Management)

```bash
# Navigate to pulumi directory
cd pulumi

# Install dependencies
npm install

# Preview infrastructure changes
pulumi preview --stack homelab

# Deploy infrastructure changes
pulumi up --stack homelab

# View current stack outputs
pulumi stack output --stack homelab

# Destroy infrastructure
pulumi destroy --stack homelab
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

### Infrastructure Components

The Pulumi code manages two main areas:

1. **Cloudflare Resources** (src/cloudflare-cloud.ts):
   - Creates a Cloudflare Tunnel for secure public access
   - Sets up DNS records pointing to the tunnel
   - Configures Zero Trust Access Application with email-based policies
   - Stores tunnel token as a Kubernetes Secret

2. **Kubernetes Resources**:
   - **Cloudflared Deployment** (src/cloudflared.ts): Runs the Cloudflare tunnel daemon in K8s with 2 replicas
   - **Foundry VTT Application** (src/foundry.ts): Complete application stack including:
     - Secrets for Foundry credentials
     - PersistentVolume backed by local hostPath on the node "new-bermuda"
     - PersistentVolumeClaim requesting 25Gi
     - Service exposing port 30000
     - Deployment running felddy/foundryvtt:13 image

### Configuration Flow

The main entry point (src/index.ts) orchestrates resource creation:
1. Loads configuration from Pulumi config (stack yaml files)
2. Creates Cloudflare resources and obtains tunnel token
3. Deploys cloudflared daemon to K8s with tunnel token
4. Deploys Foundry VTT application to K8s

Configuration is typed via src/types.ts and stored in Pulumi stack files (encrypted).

### Ansible Structure

The Ansible playbook:
- Imports the k3s-io/k3s-ansible collection playbook for cluster setup
- Installs additional dependencies like Helm
- Uses inventory.yml to define the cluster (single server node: "new-bermuda")
- Automatically merges kubeconfig for kubectl access

## Important Details

### Storage
- Foundry uses a local PersistentVolume at `/home/jack/foundrydata` on the node "new-bermuda"
- PV has node affinity to ensure it only runs on that specific node
- Uses manual storage class with Retain reclaim policy

### Networking
- Foundry is exposed on NodePort 30000 internally
- Cloudflare tunnel routes `foundry.<domain>` to `http://foundry:30000`
- Zero Trust policy allows access only to whitelisted email addresses

### K3s Configuration
- Single server node setup (can be extended to include agents)
- K3s version specified in ansible/inventory.yml
- KUBECONFIG is automatically configured for the ansible_user

### Git Branches
- Main branch: `main`
- Current working branch: `pulumi`
- Recent work involved migrating from Argo to pure Pulumi management
