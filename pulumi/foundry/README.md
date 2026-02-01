# foundry

Foundry VTT deployment on Kubernetes.

## Resources Created

- **Secret** - Kubernetes secret with Foundry credentials (admin key, username, password)
- **PersistentVolume** - 50Gi local storage at `/home/jack/foundrydata`
- **PersistentVolumeClaim** - 25Gi claim for Foundry data
- **Service** - Kubernetes service exposing port 30000
- **Deployment** - Foundry VTT container (felddy/foundryvtt:13)

## Configuration

| Key | Description |
|-----|-------------|
| `foundry:foundry.adminKey` | Foundry admin password |
| `foundry:foundry.username` | Foundry account username |
| `foundry:foundry.pw` | Foundry account password |

## Dependencies

None - this is a base stack.

## Outputs

- `foundrySecret` - The credentials secret
- `foundryPv` - The persistent volume
- `foundryPvc` - The persistent volume claim
- `foundryService` - The Kubernetes service
- `foundryDeployment` - The deployment

## Usage

```bash
npm install
pulumi up --stack homelab
```

## Notes

- Data is persisted to `/home/jack/foundrydata` on the host
- Runs on node `new-bermuda` (via node affinity)
- Service is annotated for Tailscale exposure
