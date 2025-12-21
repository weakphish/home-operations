import * as cloudflare from "@pulumi/cloudflare";
import * as pulumi from "@pulumi/pulumi";
import { InfrastructureConfig } from "./types";

/**
 * Configure Cloudflare resources - a tunnel, application and DNS records
 * @param data The configuration for the infrastructure in a typed object
 */
export async function configureCloudflare(data: InfrastructureConfig) {
    // Configurable settings
    const cloudflareAccountId = data.cloudflare.accountId;
    const zoneId = data.cloudflare.zoneId;
    const domain = data.domain;

    const tunnel = new cloudflare.ZeroTrustTunnelCloudflared("foundry_tunnel", {
        accountId: cloudflareAccountId,
        name: "foundry-tunnel",
        configSrc: "cloudflare",
    });

    // const zeroTrustAccessApplicationResource =
    //     new cloudflare.ZeroTrustAccessApplication("foundry-zero-trust-app", {
    //         accountId: cloudflareAccountId,
    //         domain: domain,
    //     });

    const dnsRecord = new cloudflare.DnsRecord("dns-record", {
        name: "foundry",
        ttl: 1,
        type: "CNAME",
        zoneId: zoneId,
        proxied: true,
        content: "a361db38-afad-4c5a-958e-509eecaec136.cfargotunnel.com", // TODO: extract
    });

    const tunnelConfig = new cloudflare.ZeroTrustTunnelCloudflaredConfig(
        "zeroTrustTunnelCloudflaredConfigResource",
        {
            accountId: tunnel.accountId,
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
        },
    );
}
