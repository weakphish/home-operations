import * as pulumi from "@pulumi/pulumi";
import * as cloudflare from "@pulumi/cloudflare";
import * as k8s from "@pulumi/kubernetes";

export interface CloudflareConfig {
	domain: string;
	accountId: string;
	zoneId: string;
}

const config = new pulumi.Config();
const data = config.requireObject<CloudflareConfig>("infrastructure");
const foundryEmails = config.requireSecretObject<string[]>("foundryEmails");
const nodeName = config.requireSecret("nodeName");

const tunnel = new cloudflare.ZeroTrustTunnelCloudflared("tunnel", {
	accountId: data.accountId,
	name: pulumi.interpolate`${nodeName}-foundry-tunnel`,
	configSrc: "cloudflare",
});

new cloudflare.DnsRecord("tunnel-dns-record", {
	name: "foundry",
	ttl: 1,
	type: "CNAME",
	zoneId: data.zoneId,
	proxied: true,
	content: pulumi.interpolate`${tunnel.id}.cfargotunnel.com`,
});

new cloudflare.ZeroTrustTunnelCloudflaredConfig("tunnelConfig", {
	accountId: data.accountId,
	tunnelId: tunnel.id,
	config: {
		ingresses: [
			{
				service: "http://foundry:30000",
				hostname: pulumi.interpolate`foundry.${data.domain}`,
			},
			{
				service: "http_status:404",
			},
		],
	},
	source: "cloudflare",
});

const emailIncludes = foundryEmails.apply(emails =>
	emails.map(e => ({ email: { email: e } })),
);

new cloudflare.ZeroTrustAccessApplication("foundry-zero-trust-app", {
	name: "foundry",
	accountId: data.accountId,
	domain: pulumi.interpolate`foundry.${data.domain}`,
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
	accountId: data.accountId,
	tunnelId: tunnel.id,
});

export const tunnelTokenSecret = new k8s.core.v1.Secret("tunnelToken", {
	metadata: {
		name: "tunnel-token",
	},
	type: "Opaque",
	stringData: {
		token: tunnelToken.token,
	},
});

export const tunnelTokenSecretName = tunnelTokenSecret.metadata.name;
