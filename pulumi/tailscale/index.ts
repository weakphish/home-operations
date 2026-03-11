import * as pulumi from "@pulumi/pulumi";
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
            {
                src: ["autogroup:member"],
                dst: ["tag:k8s"],
                ip: ["*:7777"],
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

export { acl, dnsPreferences, tailnetSettings };
