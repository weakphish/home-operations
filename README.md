# TODO
## Infra
- [ ] Write Ansible playbook to bootstrap a server
    - [Ref](https://www.reddit.com/r/selfhosted/s/ryBd8BYD8Y)
    - [ ] K3s
    - [ ] Set up ArgoCD in declarative manner
        - https://argo-cd.readthedocs.io/en/stable/operator-manual/declarative-setup/
- [ ] Set up Tailscale w/ Argo in K8s cluster
    - [X] Service annotation
    - [ ] MFA
- [ ] Make Argo available to Tailscale
## Docs
- [ ] Make network/arch diagram
- [ ] Update board

## Applications
- [ ] Look at [Semaphore](https://semaphoreui.com)
- [ ] Figure out permanent Foundry (k8s) storage
- [ ] Homebox - inventory

# Architecture Notes
## Networking
- Cloudflare for 'application' access - in my case, Foundry for DnD sessions
- Tailscale for everything else 
    - [Tailscale K8s operator pod](https://tailscale.com/kb/1236/kubernetes-operator#setup)

## Pulumi
- Used to manage Cloudflare resources
    - Creates tunnel & DNS records
    - Creates zero-trust application
- Configure and deploy ArgoCD helm chart 
- Bootstrap K8s cluster basically

## ArgoCD
- Continuous delivery of k8s resources, repo as souce-of-truth
- Cloudflared tunnel deployment

# Resources / ideas
- [K8s selfhosting reddit thread](https://www.reddit.com/r/selfhosted/comments/85rj9d/kubernetes_anyone_use_this_for_their_home_systems/)
- [Maintaining containers for various self-hosted services on a single machine](https://www.reddit.com/r/selfhosted/comments/k3jwkd/maintaining_containers_for_various_selfhosted/)
- [Use Tailscale and CF Tunnel together](https://www.reddit.com/r/selfhosted/comments/1hocwqm/can_i_safely_use_cloudflare_tunnel_and_tailscale/)
