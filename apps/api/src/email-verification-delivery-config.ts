export type EmailDeliveryEnvironment = {
  EVOLVIA_EMAIL_DELIVERY_ENDPOINT?: string;
  EVOLVIA_EMAIL_DELIVERY_TOKEN?: string;
  EVOLVIA_EMAIL_FROM?: string;
  EVOLVIA_PUBLIC_BASE_URL?: string;
};

export type EmailDeliveryConfiguration = {
  deliveryUrl: URL;
  actionUrl: URL;
  bearerToken: string;
  sender: string;
};

/**
 * Pure preflight: no token mutation, network call, or secret logging.
 * The caller must run this after checking the user's verification state
 * and before revoking/creating verification tokens.
 */
export function resolveEmailDeliveryConfiguration(
  env: EmailDeliveryEnvironment,
): EmailDeliveryConfiguration {
  const endpoint = env.EVOLVIA_EMAIL_DELIVERY_ENDPOINT?.trim();
  const bearerToken = env.EVOLVIA_EMAIL_DELIVERY_TOKEN?.trim();
  const sender = env.EVOLVIA_EMAIL_FROM?.trim();
  const publicBaseUrl = env.EVOLVIA_PUBLIC_BASE_URL?.trim();
  if (!endpoint || !bearerToken || !sender || !publicBaseUrl
    || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(sender) || /[\r\n]/u.test(sender)) {
    throw new Error('email delivery configuration invalid');
  }

  try {
    const deliveryUrl = new URL(endpoint);
    const actionUrl = new URL('/verificar-email', publicBaseUrl);
    if (deliveryUrl.protocol !== 'https:' || deliveryUrl.username || deliveryUrl.password
      || actionUrl.protocol !== 'https:' || actionUrl.username || actionUrl.password) {
      throw new Error('email delivery URL invalid');
    }
    return { deliveryUrl, actionUrl, bearerToken, sender };
  } catch {
    throw new Error('email delivery configuration invalid');
  }
}
