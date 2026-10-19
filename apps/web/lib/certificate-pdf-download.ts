const FAILURE = 'Não foi possível baixar o PDF. A página do certificado pode ser impressa.';

export async function downloadCertificatePdf(code: string): Promise<string | null> {
  try {
    const response = await fetch(`/api/public/certificates/${encodeURIComponent(code)}/pdf`, { cache: 'no-store' });
    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null);
      const record = payload && typeof payload === 'object' ? payload as { message?: unknown; error?: { message?: unknown } } : {};
      const message = typeof record.error?.message === 'string' ? record.error.message : typeof record.message === 'string' ? record.message : '';
      return message || FAILURE;
    }
    const file = URL.createObjectURL(await response.blob());
    const link = window.document.createElement('a');
    link.href = file;
    link.download = 'certificado.pdf';
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(file), 1000);
    return null;
  } catch {
    return FAILURE;
  }
}
