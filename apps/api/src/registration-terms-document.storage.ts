import { Injectable, NotFoundException } from '@nestjs/common';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export abstract class RegistrationTermsDocumentStorage {
  abstract write(storageKey: string, bytes: Buffer): Promise<void>;
  abstract read(storageKey: string): Promise<Buffer>;
  abstract rollbackNewWrite(storageKey: string): Promise<void>;
}

@Injectable()
export class LocalRegistrationTermsDocumentStorage extends RegistrationTermsDocumentStorage {
  private readonly root = resolve(process.env.EVOLVIA_TERMS_ROOT ?? '/app/data/registration-terms');

  async write(storageKey: string, bytes: Buffer): Promise<void> {
    const target = this.safePath(storageKey);
    const temporary = `${target}.tmp`;
    await mkdir(dirname(target), { recursive: true, mode: 0o750 });
    await writeFile(temporary, bytes, { flag: 'wx', mode: 0o640 });
    await rename(temporary, target);
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
