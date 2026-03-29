// To import existing resources into this stack, run:
//   pulumi import 'kubernetes:apps/v1:Deployment' cloudflared 'default/cloudflared'

import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";

const cfTunnelStack = new pulumi.StackReference("organization/cf-tunnel/homelab");
const tunnelTokenSecretName = cfTunnelStack.requireOutput("tunnelTokenSecretName");

/**
 * Deploys the Cloudflare Tunnel daemon (cloudflared).
 *
 * Establishes a persistent outbound-only connection to Cloudflare's edge network —
 * no inbound ports required. Traffic flows: public user → Cloudflare edge → tunnel
 * → this pod → Foundry service.
 */
class CloudflaredStack extends pulumi.ComponentResource {
    /** The cloudflared Deployment. */
    public readonly deployment: kubernetes.apps.v1.Deployment;

    constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
        super("homelab:networking:CloudflaredStack", name, {}, opts);

        this.deployment = new kubernetes.apps.v1.Deployment(
            "cloudflared",
            {
                metadata: { name: "cloudflared", namespace: "default" },
                spec: {
                    replicas: 1,
                    selector: { matchLabels: { app: "cloudflared" } },
                    template: {
                        metadata: { labels: { app: "cloudflared" } },
                        spec: {
                            containers: [
                                {
                                    name: "cloudflared",
                                    image: "cloudflare/cloudflared:latest",
                                    // --no-autoupdate: prevents cloudflared from trying to
                                    // download and replace its own binary at runtime.
                                    // In a container, self-updates are the wrong mechanism —
                                    // update the image tag instead.
                                    args: ["tunnel", "--no-autoupdate", "run"],
                                    env: [
                                        {
                                            name: "TUNNEL_TOKEN",
                                            valueFrom: {
                                                secretKeyRef: {
                                                    name: tunnelTokenSecretName,
                                                    key: "token",
                                                },
                                            },
                                        },
                                    ],
                                    resources: {
                                        requests: { cpu: "10m", memory: "64Mi" },
                                        limits: { cpu: "500m", memory: "128Mi" },
                                    },
                                    // cloudflared only needs network access — drop all Linux
                                    // capabilities and disable privilege escalation.
                                    securityContext: {
                                        allowPrivilegeEscalation: false,
                                        capabilities: { drop: ["ALL"] },
                                    },
                                },
                            ],
                        },
                    },
                },
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        this.registerOutputs({ deploymentName: this.deployment.metadata.name });
    }
}

const stack = new CloudflaredStack("cloudflared");
export const deploymentName = stack.deployment.metadata.name;
