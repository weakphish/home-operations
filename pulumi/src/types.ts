export interface CloudflareConfig {
    accountId: string;
    zoneId: string;
    tunnelToken: string;
    foundryEmails: Array<string>;
}

export interface InfrastructureConfig {
    domain: string;
    cloudflare: CloudflareConfig;
}
