export interface CloudflareConfig {
    accountId: string;
    zoneId: string;
    tunnelToken: string;
}

export interface InfrastructureConfig {
    domain: string;
    cloudflare: CloudflareConfig;
}
