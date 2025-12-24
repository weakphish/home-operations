import * as cloudflare from "@pulumi/cloudflare";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { InfrastructureConfig } from "./types";

/**
 * Configure Cloudflare resources - a tunnel, application and DNS records
 * @param data The configuration for the infrastructure in a typed object
 */
export function configureCloudflare(data: InfrastructureConfig) {
    // Configurable settings
    const accountId = data.cloudflare.accountId;
    const zoneId = data.cloudflare.zoneId;
    const domain = data.domain;

    const tunnel = new cloudflare.ZeroTrustTunnelCloudflared("tunnel", {
        accountId: accountId,
        name: "new-bermuda-foundry-tunnel",
        configSrc: "cloudflare",
    });

    new cloudflare.DnsRecord("tunnel-dns-record", {
        name: "foundry",
        ttl: 1,
        type: "CNAME",
        zoneId: zoneId,
        proxied: true,
        content: pulumi.interpolate`${tunnel.id}.cfargotunnel.com`,
    });

    new cloudflare.ZeroTrustTunnelCloudflaredConfig("tunnelConfig", {
        accountId: accountId,
        tunnelId: tunnel.id,
        config: {
            ingresses: [
                {
                    service: "http://foundry",
                    hostname: pulumi.interpolate`foundry.${domain}`,
                },
                {
                    service: "http_status:404",
                },
            ],
        },
        source: "cloudflare",
    });

    // Create zero-trust application
    //     const zeroTrustAccessApplicationResource =
    //         new cloudflare.ZeroTrustAccessApplication("argo-zero-trust-app", {
    //             name: "infra",
    //             accountId: accountId,
    //             domain: domain,
    //             type: "self_hosted",
    //         });
    configureCloudflaredDeployment(data.cloudflare.tunnelToken);
}

async function configureCloudflaredDeployment(token: pulumi.Input<string>) {
    const tunnelToken = new k8s.core.v1.Secret("tunnelToken", {
        metadata: {
            name: "tunnel-token",
        },
        type: "Opaque",
        stringData: {
            token: token,
        },
    });
    const cloudflaredDeployment = new k8s.apps.v1.Deployment(
        "cloudflaredDeployment",
        {
            metadata: {
                name: "cloudflared-deployment",
                namespace: "default",
            },
            spec: {
                replicas: 2,
                selector: {
                    matchLabels: {
                        pod: "cloudflared",
                    },
                },
                template: {
                    metadata: {
                        labels: {
                            pod: "cloudflared",
                        },
                    },
                    spec: {
                        containers: [
                            {
                                command: [
                                    "cloudflared",
                                    "tunnel",
                                    "--no-autoupdate",
                                    "--loglevel",
                                    "info",
                                    "--metrics",
                                    "0.0.0.0:2000",
                                    "run",
                                ],
                                // TODO: make pulumi secret
                                env: [
                                    {
                                        name: "TUNNEL_TOKEN",
                                        valueFrom: {
                                            secretKeyRef: {
                                                key: "token",
                                                name: "tunnel-token",
                                            },
                                        },
                                    },
                                ],
                                image: "cloudflare/cloudflared:latest",
                                livenessProbe: {
                                    failureThreshold: 1,
                                    httpGet: {
                                        path: "/ready",
                                        port: 2000,
                                    },
                                    initialDelaySeconds: 10,
                                    periodSeconds: 10,
                                },
                                name: "cloudflared",
                            },
                        ],
                        securityContext: {
                            sysctls: [
                                {
                                    name: "net.ipv4.ping_group_range",
                                    value: "65532 65532",
                                },
                            ],
                        },
                    },
                },
            },
        },
    );
}
