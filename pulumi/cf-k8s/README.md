# cf-connector

Cloudflare tunnel connector deployment - runs cloudflared pods that connect to the tunnel.

## Resources Created

- **Deployment** - Kubernetes deployment running 2 replicas of cloudflared pods

## Configuration

| Key | Description |
|-----|-------------|
| `cf-connector:cf-connector.tunnelTokenSecretName` | Name of the Kubernetes secret containing the tunnel token (default: `tunnel-token`) |

## Dependencies

- **cf-tunnel** stack must be deployed first (creates the tunnel token secret)

## Outputs

- `deployment` - The cloudflared Kubernetes deployment

## Usage

```bash
npm install
pulumi up --stack homelab
```

## Notes

- Runs 2 replicas for high availability
- Uses liveness probe on `/ready` endpoint (port 2000)
- Requires `net.ipv4.ping_group_range` sysctl for ICMP support
