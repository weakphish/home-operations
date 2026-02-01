# glance

Glance dashboard deployment for homelab service monitoring.

## Resources Created

- **ConfigMap** - Glance YAML configuration
- **Service** - Kubernetes service exposing port 8080
- **Ingress** - Tailscale ingress for external access
- **Deployment** - Glance container
- **Helm Release** - glance-k8s chart for additional configuration

## Configuration

| Key | Description |
|-----|-------------|
| `glance:glanceConfig.glanceConfig` | Full Glance YAML configuration (server, theme, pages, widgets) |

## Dependencies

- **tailscale** stack should be deployed first (for Tailscale ingress support)

## Outputs

None exported.

## Usage

```bash
npm install
pulumi up --stack homelab
```

## Notes

- Dashboard accessible via Tailscale at the configured hostname
- Supports custom themes, pages, and widgets via config
