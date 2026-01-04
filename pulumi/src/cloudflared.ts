import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { InfrastructureConfig } from "./types";
import { Secret } from "@pulumi/kubernetes/core/v1";

export function createCloudflaredDeployment(
    config: InfrastructureConfig,
    token: Secret,
    opts?: pulumi.ComponentResourceOptions,
) {
    const deployment = new k8s.apps.v1.Deployment(
        "cloudflared-deployment",
        {
            metadata: {
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
                        securityContext: {
                            sysctls: [
                                {
                                    name: "net.ipv4.ping_group_range",
                                    value: "65532 65532",
                                },
                            ],
                        },
                        containers: [
                            {
                                image: "cloudflare/cloudflared:latest",
                                name: "cloudflared",
                                env: [
                                    {
                                        name: "TUNNEL_TOKEN",
                                        valueFrom: {
                                            secretKeyRef: {
                                                name: token.metadata.name,
                                                key: "token",
                                            },
                                        },
                                    },
                                ],
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
                                livenessProbe: {
                                    httpGet: {
                                        path: "/ready",
                                        port: 2000,
                                    },
                                    failureThreshold: 1,
                                    initialDelaySeconds: 10,
                                    periodSeconds: 10,
                                },
                            },
                        ],
                    },
                },
            },
        },
        opts,
    );

    return deployment;
}
