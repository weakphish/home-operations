# tailscale

Tailscale ACL, DNS, and HTTPS certificate configuration for the tailnet.

## Resources Created

- **TailnetPolicy** - ACL policy: admin user gets full access; all other members restricted to Satisfactory (UDP/TCP 7777)
- **DnsPreferences** - MagicDNS enabled
- **DnsSearchPaths** / **DnsNameservers** - Tailnet DNS configuration
- **DeviceSubnetRoutes** / settings - HTTPS certificate provisioning enabled

## Configuration

| Key | Description |
|-----|-------------|
| `tailscale:apiKey` | Tailscale API key |
| `tailscale:tailnet` | Tailnet name (e.g., `example.com`) |

## Dependencies

None — this is a base stack.

## Outputs

None.

## Usage

```bash
npm install
pulumi up --stack homelab
```

## Notes

- This stack manages ACL/DNS/HTTPS policy for the tailnet via the Tailscale API — it does **not** install the Kubernetes operator.
- The Tailscale Kubernetes operator is managed separately in `pulumi/tailscale-operator/`.
