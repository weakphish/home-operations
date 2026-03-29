// To import existing resources into this stack, run:
//   pulumi import 'kubernetes:networking.k8s.io/v1:NetworkPolicy' default-deny-all 'default/default-deny-all'
//   pulumi import 'kubernetes:networking.k8s.io/v1:NetworkPolicy' allow-dns-egress 'default/allow-dns-egress'
//   pulumi import 'kubernetes:networking.k8s.io/v1:NetworkPolicy' allow-https-egress 'default/allow-https-egress'

import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";

/**
 * Provisions the baseline network security posture for the default namespace:
 * deny all traffic by default, then carve out DNS as the one universal exception.
 * Individual app stacks add their own allow rules on top.
 *
 * NetworkPolicies are additive — each policy that matches a pod's labels is OR'd
 * together. An empty policy (no rules) means "deny all" for the declared traffic
 * types.
 */
class NetworkPoliciesStack extends pulumi.ComponentResource {
    constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
        super("homelab:network:NetworkPoliciesStack", name, {}, opts);

        new kubernetes.networking.v1.NetworkPolicy(
            "default-deny-all",
            {
                metadata: { name: "default-deny-all", namespace: "default" },
                spec: {
                    // Empty podSelector matches ALL pods in the namespace
                    podSelector: {},
                    // Declaring both types with no rules = deny all ingress AND egress
                    policyTypes: ["Ingress", "Egress"],
                },
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        // DNS must be carved out explicitly — without it, pods cannot resolve K8s
        // service names or external hostnames, so even explicitly-allowed traffic
        // silently fails. Both UDP (standard) and TCP (large responses >512 bytes)
        // must be opened.
        new kubernetes.networking.v1.NetworkPolicy(
            "allow-dns-egress",
            {
                metadata: { name: "allow-dns-egress", namespace: "default" },
                spec: {
                    podSelector: {},
                    policyTypes: ["Egress"],
                    egress: [
                        {
                            ports: [
                                { port: 53, protocol: "UDP" },
                                { port: 53, protocol: "TCP" },
                            ],
                        },
                    ],
                },
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        // Several pods must reach the K8s API server (kube-state-metrics for metrics,
        // homepage for live service status). The API server is exposed as a ClusterIP
        // Service in the default namespace on port 443. Allow all pods to reach it;
        // this also covers cloudflared's outbound HTTPS to Cloudflare's edge.
        new kubernetes.networking.v1.NetworkPolicy(
            "allow-https-egress",
            {
                metadata: { name: "allow-https-egress", namespace: "default" },
                spec: {
                    podSelector: {},
                    policyTypes: ["Egress"],
                    egress: [
                        { ports: [{ port: 443, protocol: "TCP" }] },
                    ],
                },
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        this.registerOutputs({});
    }
}

new NetworkPoliciesStack("network-policies");
