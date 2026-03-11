import * as pulumi from "@pulumi/pulumi";
import * as cloudflare from "@pulumi/cloudflare";
import * as k8s from "@pulumi/kubernetes";

export interface CloudflareConfig {
	domain: string;
	accountId: string;
	zoneId: string;
}

/**
 * Configure Cloudflare resources - a tunnel, application and DNS records
 * @param data The configuration for the infrastructure in a typed object
 * @param foundryServiceName The name of the Foundry Kubernetes service to reference in tunnel config
 * @returns The tunnel token secret object created
 */
function configureCloudflare (
	data: CloudflareConfig,
	foundryEmails: string[],
	nodeName: string,
	foundryServiceName: pulumi.Input<string>,
) {
	// Configurable settings
	const accountId = data.accountId;
	const zoneId = data.zoneId;
	const domain = data.domain;

	const tunnel = new cloudflare.ZeroTrustTunnelCloudflared("tunnel", {
		accountId: accountId,
		name: `${nodeName}-foundry-tunnel`,
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
					service: pulumi.interpolate`http://${foundryServiceName}:30000`,
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
	const emailIncludes = foundryEmails.map((e: string) => {
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

	const tunnelToken = cloudflare.getZeroTrustTunnelCloudflaredTokenOutput({
		accountId: accountId,
		tunnelId: tunnel.id,
	});

	return configureCloudflareTokenSecret(tunnelToken.token);
}

function configureCloudflareTokenSecret (
	token: pulumi.Input<string>,
): k8s.core.v1.Secret {
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

const config = new pulumi.Config();
const data = config.requireObject<CloudflareConfig>("infrastructure");
const foundryEmails = config.requireSecretObject<string[]>("foundryEmails");
const nodeName = config.requireSecret("nodeName");

// Foundry service name is hardcoded — service is now managed by Flux
const foundryServiceName = "foundry";

const tunnelTokenSecret = pulumi.all([foundryEmails, nodeName]).apply(
	([emails, node]) =>
		configureCloudflare(data, emails, node, foundryServiceName),
);

export const tunnelTokenSecretName = tunnelTokenSecret.apply(
	(s) => s.metadata.name,
);

export { tunnelTokenSecret };
