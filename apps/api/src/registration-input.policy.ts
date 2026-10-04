export function formTextHasInjection(value: string): boolean {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value) || /[<>`]|\$\{|javascript\s*:/iu.test(value);
}
