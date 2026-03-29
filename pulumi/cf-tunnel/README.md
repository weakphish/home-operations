# cf-tunnel

Cloudflare tunnel and Zero Trust configuration for Foundry VTT access.

## Resources Created

- **ZeroTrustTunnelCloudflared** - Cloudflare tunnel for secure ingress
- **DnsRecord** - CNAME record pointing `foundry.<domain>` to the tunnel
- **ZeroTrustTunnelCloudflaredConfig** - Tunnel ingress configuration routing to the Foundry service
- **ZeroTrustAccessApplication** - Zero Trust application with email-based access policy
- **Secret** - Kubernetes secret containing the tunnel token (consumed by the `cloudflared` stack)

## Configuration

| Key | Description |
|-----|-------------|
| `cloudflare:apiToken` | Cloudflare API token with `Account.Cloudflare Tunnel` and `Zone.DNS` permissions |
| `cf-tunnel:infrastructure.accountId` | Cloudflare account ID |
| `cf-tunnel:infrastructure.zoneId` | Cloudflare zone ID |
| `cf-tunnel:infrastructure.domain` | Domain name (e.g., `example.com`) |
| `cf-tunnel:infrastructure.tunnelToken` | Tunnel token for cloudflared authentication |
| `cf-tunnel:infrastructure.foundryEmails` | List of email addresses allowed to access Foundry |

## Dependencies

None — this is a base stack. The `cloudflared` stack has a StackReference dependency on this stack.

## Outputs

- `tunnelTokenSecretName` - The name of the Kubernetes secret containing the tunnel token
- `tunnelSecret` - The tunnel token value (secret)

## Usage

```bash
npm install
pulumi up --stack homelab
```
