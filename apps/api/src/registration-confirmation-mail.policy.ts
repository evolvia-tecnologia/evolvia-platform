export const CONFIRMATION_EMAIL_ATTEMPT_LIMIT = 3;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;

export type ConfirmationEmailReason = 'delivered' | 'rejected' | 'not_configured' | 'missing_recipient';

export type DeliveryConfig = {
  endpoint: string;
  token: string;
  sender: string;
  publicBaseUrl: string;
};

export function readRegistrationEmail(registrationData: unknown): string | null {
  if (!registrationData || typeof registrationData !== 'object' || Array.isArray(registrationData)) return null;
  const value = (registrationData as { email?: unknown }).email;
  if (typeof value !== 'string' || /[\r\n]/u.test(value)) return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) return null;
  return email;
}

export function readDeliveryConfig(env: NodeJS.ProcessEnv): DeliveryConfig | null {
  const endpoint = env.EVOLVIA_EMAIL_DELIVERY_ENDPOINT?.trim() ?? '';
  const token = env.EVOLVIA_EMAIL_DELIVERY_TOKEN?.trim() ?? '';
  const sender = env.EVOLVIA_EMAIL_FROM?.trim() ?? '';
  const publicBaseUrl = env.EVOLVIA_PUBLIC_BASE_URL?.trim() ?? '';
  if (!endpoint || !token || !sender || !publicBaseUrl) return null;
  if (!EMAIL.test(sender) || /[\r\n]/u.test(sender)) return null;
  let deliveryUrl: URL;
  let base: URL;
  try {
    deliveryUrl = new URL(endpoint);
    base = new URL(publicBaseUrl);
  } catch {
    return null;
  }
  if (deliveryUrl.protocol !== 'https:' || deliveryUrl.username || deliveryUrl.password) return null;
  if (base.protocol !== 'https:' || base.username || base.password) return null;
  return { endpoint: deliveryUrl.toString(), token, sender, publicBaseUrl: base.origin };
}

export function credentialUrl(publicBaseUrl: string, slug: string, protocol: string): string | null {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug) || slug.length > 80) return null;
  if (!/^EVO-[A-F0-9]{16}$/u.test(protocol)) return null;
  let url: URL;
  try { url = new URL(`/evento/${slug}/inscricao`, publicBaseUrl); }
  catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  url.searchParams.set('protocolo', protocol);
  return url.toString();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char] ?? char));
}

function plain(value: string): string {
  return value.replace(/[\r\n]+/gu, ' ').trim().slice(0, 180);
}

export function confirmationMessage(input: {
  eventName: string;
  protocol: string;
  credentialUrl: string;
  sender: string;
  recipient: string;
}) {
  const eventName = plain(input.eventName) || 'seu evento';
  return {
    schema: 'evolvia.transactional-email.v1',
    message: {
      from: input.sender,
      to: [input.recipient],
      subject: 'Sua inscrição foi confirmada',
      text: [
        `Sua inscrição em ${eventName} foi confirmada.`,
        '',
        `Protocolo: ${input.protocol}`,
        `Acompanhe a inscrição: ${input.credentialUrl}`,
        '',
        'Guarde esta mensagem. O protocolo é a credencial desta inscrição.',
      ].join('\n'),
      html: [
        `<p>Sua inscrição em ${escapeHtml(eventName)} foi confirmada.</p>`,
        `<p>Protocolo: ${escapeHtml(input.protocol)}</p>`,
        `<p><a href="${escapeHtml(input.credentialUrl)}">Acompanhar minha inscrição</a></p>`,
        '<p>Guarde esta mensagem. O protocolo é a credencial desta inscrição.</p>',
      ].join(''),
    },
    metadata: { purpose: 'registration-confirmation' },
  };
}
