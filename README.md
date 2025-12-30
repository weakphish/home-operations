# Install & Setup Notes
## Ansible
- Seems to require `export ANSIBLE_BECOME_EXE=sudo.ws` due to [this issue](https://github.com/ansible/ansible/issues/85837)
- Run with `ansible-playbook playbook.yml -i inventory.yml -kK` where the flags have you manually input SSH password

## Argo
- Have to manually configure repo connection / secret
    - Could bypass with [SealedSecrets](https://argo-cd.readthedocs.io/en/stable/operator-manual/declarative-setup/#repositories), but don't feel like it yet

## Foundry Service
- Need to manually create foundry-creds secret

## Cloudflared Service 
- Need to manually create tunnel-token secret

## Tailscaled
- Had to manually add OAuth client ID / secret in Argo UI for the Helm chart
    - Probably a better way to do this

# Repo Structure
- `ansible/` - Contains Ansible playbook to bootstrap K3s with ArgoCD onto a new machine
- `argo/` - Contains Argo resource definitions
    - `argo/applications/` - Resource definition for Argo applications, mostly referencing the resources mirrored in the `k3s` directory
- `k3s/` - Kubernetes resource definitions, grouped into directory by their application
- `pulumi` - IaC for managing cloud resources - in my case, Cloudflare tunnels and zero-trust applications

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
- There is some overlap between Pulumi and Argo, as the Cloudflare resource creates a k8s secret to be used by the cloudflared deployment

## ArgoCD
- Continuous delivery of k8s resources, repo as souce-of-truth
- Cloudflared tunnel deployment

# TODO
## Infra
- [x] Write Ansible playbook to bootstrap a server
    - [Ref](https://www.reddit.com/r/selfhosted/s/ryBd8BYD8Y)
    - [x] K3s
- [x] Set up ArgoCD in declarative manner
    - https://argo-cd.readthedocs.io/en/stable/operator-manual/declarative-setup/
    - [x] Apply w/ Ansible during bootstrap?
- [ ] Set up Tailscale w/ Argo in K8s cluster
    - [X] Service annotation
    - [ ] MFA
- [ ] Add server itself to [Tailscale](https://login.tailscale.com/admin/machines/new-linux)
- [x] Make Argo available to Tailscale
    - [ ] Fix HTTPS
- [ ] Have Argo [manage itself](https://argo-cd.readthedocs.io/en/stable/operator-manual/declarative-setup/#manage-argo-cd-using-argo-cd)
- [ ] [Tailnet Lock](https://tailscale.com/kb/1226/tailnet-lock)

## Docs
- [X] Document repo structure in README
- [ ] Make network/arch diagram
- [ ] Update board

## Hardware
- [ ] Get a NAS for backups

## Applications
- [ ] Figure out permanent Foundry (k8s) storage
- [ ] Look at [Semaphore](https://semaphoreui.com)
- [ ] Homebox - inventory
- [ ] Wingfit
- [ ] A [KMS](https://github.com/awesome-selfhosted/awesome-selfhosted?tab=readme-ov-file#knowledge-management-tools)
    - Also see [note-taking section](https://github.com/awesome-selfhosted/awesome-selfhosted?tab=readme-ov-file#note-taking--editors)
    - Use for DnD campaigns or whatnot, not neccesarily Notes.app replacement
- [ ] [Dumbware](https://dumbware.io)
- [ ] [Yamtrack](https://github.com/FuzzyGrim/Yamtrack)
- [ ] [ActualBudget](https://actualbudget.org)
- [ ] [iHateMoney](https://ihatemoney.org/) - shared expense tracker
- [ ] [Glance dashboard](https://github.com/glanceapp/glance)
- [ ] [Recipe manager](https://github.com/awesome-selfhosted/awesome-selfhosted?tab=readme-ov-file#recipe-management)

# Resources / ideas
- [Awesome Selfhosting](https://github.com/awesome-selfhosted/awesome-selfhosted)
- [K8s selfhosting reddit thread](https://www.reddit.com/r/selfhosted/comments/85rj9d/kubernetes_anyone_use_this_for_their_home_systems/)
- [Maintaining containers for various self-hosted services on a single machine](https://www.reddit.com/r/selfhosted/comments/k3jwkd/maintaining_containers_for_various_selfhosted/)
- [Use Tailscale and CF Tunnel together](https://www.reddit.com/r/selfhosted/comments/1hocwqm/can_i_safely_use_cloudflare_tunnel_and_tailscale/)
