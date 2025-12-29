# TODO
## Infra
- [x] Write Ansible playbook to bootstrap a server
    - [Ref](https://www.reddit.com/r/selfhosted/s/ryBd8BYD8Y)
    - [x] K3s
- [ ] Set up ArgoCD in declarative manner
    - https://argo-cd.readthedocs.io/en/stable/operator-manual/declarative-setup/
    - [x] Apply w/ Ansible during bootstrap?
- [ ] Set up Tailscale w/ Argo in K8s cluster
    - [X] Service annotation
    - [ ] MFA
- [ ] Make Argo available to Tailscale
- [ ] Have Argo [manage itself](https://argo-cd.readthedocs.io/en/stable/operator-manual/declarative-setup/#manage-argo-cd-using-argo-cd)
## Docs
- [ ] Document repo structure in README
- [ ] Make network/arch diagram
- [ ] Update board

## Applications
- [ ] Look at [Semaphore](https://semaphoreui.com)
- [ ] Figure out permanent Foundry (k8s) storage
- [ ] Homebox - inventory

# Install & Setup Notes
## Ansible
- Seems to require `export ANSIBLE_BECOME_EXE=sudo.ws` due to [this issue](https://github.com/ansible/ansible/issues/85837)
- Run with `ansible-playbook playbook.yml -i inventory.yml -kK` where the flags have you manually input SSH password

## Argo
- Have to manually configure repo connection / secret
    - Could bypass with [SealedSecrets](https://argo-cd.readthedocs.io/en/stable/operator-manual/declarative-setup/#repositories), but don't feel like it yet

## Foundry Service
- Need to manually create foundry-creds secret

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
