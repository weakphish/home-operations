export interface CloudflareConfig {
    accountId: string;
    zoneId: string;
}

export interface InfrastructureConfig {
    domain: string;
    cloudflare: CloudflareConfig;
}
