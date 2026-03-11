# Install & Setup Notes
## Ansible
- Seems to require `export ANSIBLE_BECOME_EXE=sudo.ws` due to [this issue](https://github.com/ansible/ansible/issues/85837)
- Run with `ansible-playbook playbook.yml -i inventory.yml -kK` where the flags have you manually input SSH password

# Repo Structure
- `ansible/` - Ansible playbook to bootstrap K3s cluster
- `pulumi/` - IaC for cloud API resources (Cloudflare tunnel, Tailscale ACL/settings)
- `flux/` - Flux CD manifests for all in-cluster K8s workloads

# Architecture Notes

## Diagram

```mermaid
flowchart TB
    subgraph Internet
        Users[External Users]
        CF[Cloudflare]
    end

    subgraph Tailnet[Tailscale Network]
        Admin[Admin/Internal Users]
    end

    subgraph IaC[IaC Layer]
        Pulumi[Pulumi\ncf-tunnel · tailscale ACL]
        Flux[Flux CD\napp workloads]
    end

    subgraph Cluster[K3s Cluster]
        subgraph Server["Control Plane (new-bermuda)"]
            subgraph Networking
                TSOperator[Tailscale Operator]
                Cloudflared[cloudflared]
            end

            subgraph Apps[Applications]
                Foundry[Foundry VTT]
                Homepage[Homepage Dashboard]
                Paperless[Paperless-ngx]
                Dashdot[Dashdot]
                Donetick[Donetick]
                Portainer[Portainer]
            end

            subgraph Monitoring[Monitoring Stack]
                Prometheus[Prometheus]
                Grafana[Grafana]
                Alertmanager[Alertmanager]
            end

            subgraph Storage
                FoundryPV[(PV: foundry 50Gi)]
                PaperlessPVs[(PVs: paperless x5)]
                DonetickPV[(PV: donetick 10Gi)]
                PortainerPV[(PV: portainer 10Gi)]
            end
        end

        subgraph Agent["Agent Node (infinite-granite) — Tainted: NoSchedule"]
            Satisfactory[Satisfactory Server]
            SatisfactoryPV[(PV: /home/jack/satisfactory)]
            Satisfactory --> SatisfactoryPV
        end
    end

    Flux -->|reconciles| Cluster
    Pulumi -->|manages API| CF
    Pulumi -->|manages ACL/DNS| Tailnet

    Users -->|HTTPS| CF
    CF -->|Zero Trust Auth| CF
    CF -->|Tunnel| Cloudflared
    Cloudflared -->|:30000| Foundry

    Admin -->|Tailscale Full Access| TSOperator
    TSOperator -->|Ingress HTTPS| Foundry
    TSOperator -->|Ingress HTTPS| Homepage
    TSOperator -->|Ingress HTTPS| Paperless
    TSOperator -->|Ingress HTTPS| Dashdot
    TSOperator -->|Ingress HTTPS| Donetick
    TSOperator -->|Ingress HTTPS| Portainer
    TSOperator -->|Ingress HTTPS| Grafana
    TSOperator -->|Ingress HTTPS| Prometheus
    TSOperator -->|Ingress HTTPS| Alertmanager
    TSOperator -->|LoadBalancer UDP| Satisfactory

    Members[Tailnet Members] -->|Tailscale :7777 only| Satisfactory

    Foundry --> FoundryPV
    Paperless --> PaperlessPVs
    Donetick --> DonetickPV
    Portainer --> PortainerPV

    style CF fill:#f6821f
    style TSOperator fill:#4a5568
    style Flux fill:#5468ff
    style Pulumi fill:#8a6cf7
    style Foundry fill:#7c3aed
    style Homepage fill:#10b981
    style Satisfactory fill:#f97316
    style Grafana fill:#ff6b6b
    style Prometheus fill:#e08234
    style Alertmanager fill:#e05d44
    style Paperless fill:#17541f
    style Dashdot fill:#6366f1
    style Donetick fill:#0ea5e9
    style Portainer fill:#13bef9
    style Agent fill:#3b82f6
```

## Networking
- **Cloudflare Tunnel**: Public access for Foundry VTT with Zero Trust email allowlist
- **Tailscale**: Private HTTPS access for all other services via Tailscale Ingress
  - ACL: admin user has full access; all other tailnet members restricted to Satisfactory (port 7777) only

## IaC Strategy
- **Pulumi** (`pulumi/`): Cloud API resources only — Cloudflare tunnel/DNS/Zero Trust, Tailscale ACL/MagicDNS/HTTPS settings
- **Flux CD** (`flux/`): All in-cluster K8s workloads — app deployments, services, ingresses, secrets (SOPS-encrypted), PVs/PVCs

# Resources / ideas
- [Awesome Selfhosting](https://github.com/awesome-selfhosted/awesome-selfhosted)
- [K8s selfhosting reddit thread](https://www.reddit.com/r/selfhosted/comments/85rj9d/kubernetes_anyone_use_this_for_their_home_systems/)
- [Maintaining containers for various self-hosted services on a single machine](https://www.reddit.com/r/selfhosted/comments/k3jwkd/maintaining_containers_for_various_selfhosted/)
- [Use Tailscale and CF Tunnel together](https://www.reddit.com/r/selfhosted/comments/1hocwqm/can_i_safely_use_cloudflare_tunnel_and_tailscale/)
