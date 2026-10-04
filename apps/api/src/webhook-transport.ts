import { lookup } from 'node:dns';
import { request, type RequestOptions } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { normalizeWebhookUrl } from './integration-foundation.policy';

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3],
] as const) blocked.addSubnet(address, prefix, 'ipv4');
blocked.addSubnet('2001::', 23, 'ipv6');
blocked.addSubnet('2001:db8::', 32, 'ipv6');
blocked.addSubnet('2002::', 16, 'ipv6');
blocked.addSubnet('3fff::', 20, 'ipv6');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');

export function isPublicWebhookAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  // Deny mapped IPv4, ULA, link-local, multicast and transition ranges.
  return family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}

export function webhookLookup(resolve: typeof lookup = lookup): NonNullable<RequestOptions['lookup']> {
  return (hostname, options, callback) => {
    resolve(hostname, { all: true }, (error, addresses) => {
      if (error) { callback(error, '', 0); return; }
      if (!addresses.length || addresses.some(({ address }) => !isPublicWebhookAddress(address))) {
        callback(new Error('O webhook precisa resolver somente para endereços públicos.'), '', 0);
        return;
      }
      // Return the validated DNS result directly to this socket: no second resolution.
      if (options.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

export async function postWebhook(url: string, body: string, headers: Record<string, string>): Promise<number> {
  const target = normalizeWebhookUrl(url);
  return new Promise((resolve, reject) => {
    const outgoing = request(target, {
      method: 'POST', headers, agent: false, lookup: webhookLookup(),
      signal: AbortSignal.timeout(4_000), maxHeaderSize: 16_384,
    }, (response) => {
      // No redirects and no unbounded response body; only the status is needed.
      const status = response.statusCode ?? 0;
      response.destroy();
      resolve(status);
    });
    outgoing.on('error', reject);
    outgoing.end(body);
  });
}
