import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export abstract class RegistrationTermsDocumentStorage {
  abstract write(storageKey: string, bytes: Buffer): Promise<void>;
  abstract read(storageKey: string): Promise<Buffer>;
  abstract rollbackNewWrite(storageKey: string): Promise<void>;
}

@Injectable()
export class LocalRegistrationTermsDocumentStorage extends RegistrationTermsDocumentStorage {
  private readonly root = resolve(process.env.EVOLVIA_TERMS_ROOT ?? join(process.cwd(), 'data', 'registration-terms'));

  async write(storageKey: string, bytes: Buffer): Promise<void> {
    const target = this.safePath(storageKey);
    const temporary = `${target}.${randomUUID()}.tmp`;
    let ownsTemporary = false;
    try {
      await mkdir(dirname(target), { recursive: true, mode: 0o750 });
      const handle = await open(temporary, 'wx', 0o640);
      ownsTemporary = true;
      try {
        await handle.writeFile(bytes);
      } finally {
        await handle.close();
      }
      await rename(temporary, target);
    } catch {
      if (ownsTemporary) await rm(temporary, { force: true }).catch(() => undefined);
      throw new ServiceUnavailableException('Não foi possível armazenar o PDF dos termos. Peça à administração para verificar a configuração e a permissão do armazenamento.');
    }
  }

  async read(storageKey: string): Promise<Buffer> {
    try {
      return await readFile(this.safePath(storageKey));
    } catch {
      throw new NotFoundException('Documento dos termos não encontrado.');
    }
  }

  async rollbackNewWrite(storageKey: string): Promise<void> {
    await rm(this.safePath(storageKey), { force: true });
  }

  private safePath(storageKey: string): string {
    if (!/^[a-z0-9]+\/[a-z0-9]+\/[0-9a-f-]{36}\.pdf$/u.test(storageKey)) {
      throw new NotFoundException('Documento dos termos não encontrado.');
    }
    const target = resolve(join(this.root, storageKey));
    if (!target.startsWith(`${this.root}/`)) throw new NotFoundException('Documento dos termos não encontrado.');
    return target;
  }
}
