// To import existing resources into this stack, run:
//   pulumi import 'kubernetes:core/v1:Namespace' tailscale 'tailscale'
//   pulumi import 'kubernetes:core/v1:Secret' tailscale-oauth 'tailscale/tailscale-oauth'
//   pulumi import 'kubernetes:helm.sh/v3:Release' tailscale-operator 'tailscale/tailscale-operator'

import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";

const config = new pulumi.Config();

const clientId = config.requireSecret("clientId");
const clientSecret = config.requireSecret("clientSecret");

/**
 * Deploys the Tailscale Kubernetes operator, which provisions proxy nodes for:
 * - Ingress resources with `ingressClassName: tailscale` (HTTPS proxy)
 * - Services with `loadBalancerClass: tailscale` (TCP/UDP proxy, used by Satisfactory)
 */
class TailscaleOperatorStack extends pulumi.ComponentResource {
    /** The operator's Helm release. */
    public readonly release: kubernetes.helm.v3.Release;

    constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
        super("homelab:networking:TailscaleOperatorStack", name, {}, opts);

        const ns = new kubernetes.core.v1.Namespace(
            "tailscale",
            { metadata: { name: "tailscale" } },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        const oauthSecret = new kubernetes.core.v1.Secret(
            "tailscale-oauth",
            {
                metadata: { name: "tailscale-oauth", namespace: "tailscale" },
                type: "Opaque",
                stringData: {
                    clientId: clientId,
                    clientSecret: clientSecret,
                },
            },
            { parent: this, dependsOn: [ns], aliases: [{ parent: pulumi.rootStackResource }] },
        );

        this.release = new kubernetes.helm.v3.Release(
            "tailscale-operator",
            {
                name: "tailscale-operator",
                namespace: "tailscale",
                chart: "tailscale-operator",
                repositoryOpts: { repo: "https://pkgs.tailscale.com/helmcharts" },
                values: {
                    oauth: {
                        clientId: clientId,
                        clientSecret: clientSecret,
                    },
                },
            },
            { parent: this, dependsOn: [ns, oauthSecret], aliases: [{ parent: pulumi.rootStackResource }] },
        );

        this.registerOutputs({ releaseName: this.release.name });
    }
}

const stack = new TailscaleOperatorStack("tailscale-operator");
export const tailscaleNamespace = "tailscale";
export const releaseName = stack.release.name;
