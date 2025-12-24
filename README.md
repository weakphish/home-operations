# TODO
- [X] Remove non-foundry Cloudflare
- [X] Set up ArgoCD - Pulumi bootstrap
    - Port forward from K9s to set up from laptop
- [ ] Set up Tailscale w/ Argo in K8s cluster
    - [X] K8s operator
        - Set up by manually inputting Helm chart into Argo UI w/ client ID/secret
            - Would be nice to make this more automatic
    - [x] Test w/ Foundry service
    - [X] Service annotation
    - [ ] MFA
- [ ] Update board
- [ ] Make network/arch diagram

- [ ] Expose Foundry w/ Cloudflare
- [ ] Figure out permanent Foundry (k8s) storage

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
