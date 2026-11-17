import { Header, applyDecorators } from '@nestjs/common';

export const AUTH_CACHE_CONTROL = 'no-store, max-age=0';
export const AUTH_PRAGMA = 'no-cache';
export const AUTH_EXPIRES = '0';

export function NoStore(): MethodDecorator {
  return applyDecorators(
    Header('Cache-Control', AUTH_CACHE_CONTROL),
    Header('Pragma', AUTH_PRAGMA),
    Header('Expires', AUTH_EXPIRES),
  );
}
