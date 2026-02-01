import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as tailscale from "@pulumi/tailscale";

const config = new pulumi.Config();
const clientId = config.requireSecret("clientId");
const clientSecret = config.requireSecret("clientSecret");
const adminUser = config.requireSecret("adminUser");

// Configure the Tailscale provider with OAuth credentials
const tailscaleProvider = new tailscale.Provider("tailscale-provider", {
    oauthClientId: clientId,
    oauthClientSecret: clientSecret,
});

// Tailnet ACL configuration
const acl = new tailscale.Acl("tailnet-acl", {
    acl: adminUser.apply(user => JSON.stringify({
        grants: [
            {
                src: [user],
                dst: ["*"],
                ip: ["*"],
            },
        ],
        ssh: [
            {
                action: "check",
                src: ["autogroup:member"],
                dst: ["autogroup:self"],
                users: ["autogroup:nonroot", "root"],
            },
        ],
        tagOwners: {
            "tag:k8s-operator": [],
            "tag:k8s": ["tag:k8s-operator"],
        },
    })),
    overwriteExistingContent: true,
}, { provider: tailscaleProvider });

// Enable MagicDNS
const dnsPreferences = new tailscale.DnsPreferences("dns-preferences", {
    magicDns: true,
}, { provider: tailscaleProvider });

// Enable HTTPS certificate provisioning
const tailnetSettings = new tailscale.TailnetSettings("tailnet-settings", {
    httpsEnabled: true,
}, { provider: tailscaleProvider });

const namespace = new k8s.core.v1.Namespace(
    "tailscale-namespace",
    {
        metadata: {
            name: "tailscale",
        },
    },
);

const operator = new k8s.helm.v3.Chart(
    "tailscale-operator",
    {
        chart: "tailscale-operator",
        namespace: namespace.metadata.name,
        fetchOpts: {
            repo: "https://pkgs.tailscale.com/helmcharts",
        },
        values: {
            oauth: {
                clientId: clientId,
                clientSecret: clientSecret,
            },
        },
    },
    { dependsOn: [namespace] },
);

export { namespace, operator, acl, dnsPreferences, tailnetSettings };
