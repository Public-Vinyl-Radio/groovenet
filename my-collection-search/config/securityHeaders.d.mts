export function contentSecurityPolicy(options?: { dev?: boolean }): string;
export const ENFORCED_CSP: string;
export const HSTS: string;
export interface HeaderRule {
  source: string;
  has?: { type: string; key: string; value?: string }[];
  headers: { key: string; value: string }[];
}
export function securityHeaderRules(options?: { dev?: boolean }): HeaderRule[];
