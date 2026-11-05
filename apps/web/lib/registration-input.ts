const SORTED_CALLING_CODES = '1 7 20 27 30 31 32 33 34 36 39 40 41 43 44 45 46 47 48 49 51 52 53 54 56 57 58 60 61 62 63 64 65 66 81 82 84 86 90 91 92 93 94 95 98 211 212 213 216 218 220 221 222 223 224 225 226 227 228 229 230 231 232 233 234 235 236 237 238 239 240 241 242 243 244 245 246 247 248 249 250 251 252 253 254 255 256 257 258 260 261 262 263 264 265 266 267 268 269 290 291 297 298 299 350 351 352 353 354 355 356 357 358 359 370 371 372 373 374 375 376 377 378 380 381 382 383 385 386 387 389 420 421 423 500 501 502 503 504 505 506 507 508 509 590 591 592 593 594 595 596 597 598 599 670 672 673 674 675 676 677 678 679 680 681 682 683 685 686 687 688 689 690 691 692 850 852 853 855 856 880 886 960 961 962 963 964 965 966 967 968 970 971 972 973 974 975 976 977 992 993 994 995 996 998'.split(' ').sort((a, b) => b.length - a.length);

export type RegistrationAnswer = string | number | boolean | string[];

/** An edited preferred name, including an intentional blank, belongs to the person. */
export function updateRegistrationAnswer(
  current: Record<string, RegistrationAnswer>, code: string, value: RegistrationAnswer,
  preferredNameEdited: boolean,
): Record<string, RegistrationAnswer> {
  const next = { ...current, [code]: value };
  if (code === 'full_name' && typeof value === 'string' && !preferredNameEdited) {
    const names = value.trim().split(/\s+/u).filter(Boolean);
    next.preferred_name = names.length > 1 ? `${names[0]} ${names[names.length - 1]}` : (names[0] ?? '');
  }
  return next;
}

export type PhoneParts = { ddi: string; area: string; number: string };
export function joinPhone({ ddi, area, number }: PhoneParts): string {
  if (!area && !number) return '';
  return `+${ddi}${area}${number}`;
}

export function splitPhone(value: string): PhoneParts {
  const digits = value.replace(/\D/gu, '');
  if (!digits) return { ddi: '55', area: '', number: '' };
  if (!value.trim().startsWith('+') || digits.startsWith('55')) {
    const national = value.trim().startsWith('+') || /^55\d{10,11}$/u.test(digits) ? digits.slice(2) : digits;
    return { ddi: '55', area: national.slice(0, 2), number: national.slice(2) };
  }
  // Longest valid calling prefix; shared territories use their common calling code.
  const ddi = SORTED_CALLING_CODES.find((code) => digits.startsWith(code)) ?? '';
  return { ddi, area: '', number: ddi ? digits.slice(ddi.length) : digits };
}

export function phoneError(value: string): string | null {
  if (!/^(?:\+)?[\d\s().-]+$/u.test(value.trim())) return 'Informe DDI, DDD e número, usando apenas dígitos.';
  const parts = splitPhone(value);
  const national = parts.area + parts.number;
  if (!parts.ddi || !/^[1-9]\d{0,2}$/u.test(parts.ddi) || parts.ddi.length + national.length > 15 || national.length < 4) {
    return 'Informe um telefone internacional válido, com DDI e número.';
  }
  if (parts.ddi === '55' && (!/^[1-9][1-9]$/u.test(parts.area) || !/^(?:[2-5]\d{7}|9\d{8})$/u.test(parts.number))) {
    return 'Informe o DDD com 2 dígitos e o número com 8 ou 9 dígitos.';
  }
  return null;
}
