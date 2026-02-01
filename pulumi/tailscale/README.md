# tailscale

Tailscale operator for Kubernetes, enabling Tailscale-based ingress and service exposure.

## Resources Created

- **Namespace** - Dedicated `tailscale` namespace
- **Helm Release** - Tailscale operator chart

## Configuration

| Key | Description |
|-----|-------------|
| `tailscale:tailscale.clientId` | Tailscale OAuth client ID |
| `tailscale:tailscale.clientSecret` | Tailscale OAuth client secret |

## Dependencies

None - this is a base stack.

## Outputs

- `tailscaleNs` - The tailscale namespace
- `tailscaleOperator` - The Helm release

## Usage

```bash
npm install
pulumi up --stack homelab
```

## Notes

- Creates OAuth credentials for the Tailscale operator
- Other stacks can use Tailscale annotations for service exposure
