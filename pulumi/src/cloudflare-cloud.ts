import * as cloudflare from "@pulumi/cloudflare";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { InfrastructureConfig } from "./types";
import { ZeroTrustAccessApplicationPolicyIncludeEmail } from "@pulumi/cloudflare/types/input";
import { Secret } from "@pulumi/kubernetes/core/v1";

/**
 * Configure Cloudflare resources - a tunnel, application and DNS records
 * @param data The configuration for the infrastructure in a typed object
 * @param foundryService The Foundry Kubernetes service to reference in tunnel config
 * @returns The tunnel token secret object created
 */
export function configureCloudflare(
    data: InfrastructureConfig,
    foundryService: k8s.core.v1.Service
) {
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
                    service: pulumi.interpolate`http://${foundryService.metadata.name}:30000`,
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
    const emailIncludes = data.cloudflare.foundryEmails.map((e: string) => {
        return {
            email: {
                email: e,
            },
        };
    });

    new cloudflare.ZeroTrustAccessApplication("foundry-zero-trust-app", {
        name: "foundry",
        accountId: accountId,
        domain: pulumi.interpolate`foundry.${domain}`,
        type: "self_hosted",
        policies: [
            {
                name: "allow-dnd-players",
                decision: "allow",
                includes: emailIncludes,
            },
        ],
    });

    return configureCloudflareTokenSecret(data.cloudflare.tunnelToken);
}

async function configureCloudflareTokenSecret(
    token: pulumi.Input<string>,
): Promise<Secret> {
    return new k8s.core.v1.Secret("tunnelToken", {
        metadata: {
            name: "tunnel-token",
        },
        type: "Opaque",
        stringData: {
            token: token,
        },
    });
}
