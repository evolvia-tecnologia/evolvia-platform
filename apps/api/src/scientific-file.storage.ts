import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export abstract class ScientificFileStorage {
  abstract write(storageKey: string, bytes: Buffer): Promise<void>;
  abstract read(storageKey: string): Promise<Buffer>;
  abstract remove(storageKey: string): Promise<void>;
}

@Injectable()
export class LocalScientificFileStorage extends ScientificFileStorage {
  private readonly root = resolve(process.env.EVOLVIA_SCIENTIFIC_FILES_ROOT ?? join(process.cwd(), 'data', 'scientific-files'));

  async write(storageKey: string, bytes: Buffer): Promise<void> {
    const target = this.safePath(storageKey);
    const temporary = `${target}.tmp`;
    try {
      await mkdir(dirname(target), { recursive: true, mode: 0o750 });
      await writeFile(temporary, bytes, { flag: 'wx', mode: 0o640 });
      await rename(temporary, target);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : '';
      if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') {
        throw new ServiceUnavailableException('O armazenamento de arquivos científicos não está configurado.');
      }
      throw error;
    }
  }

  async read(storageKey: string): Promise<Buffer> {
    try {
      return await readFile(this.safePath(storageKey));
    } catch {
      throw new NotFoundException('Arquivo científico não encontrado.');
    }
  }

  async remove(storageKey: string): Promise<void> {
    await rm(this.safePath(storageKey), { force: true });
  }

  private safePath(storageKey: string): string {
    if (!/^[a-z0-9]+\/[a-z0-9]+\/[0-9a-f-]{36}\.pdf$/u.test(storageKey)) {
      throw new NotFoundException('Arquivo científico não encontrado.');
    }
    const target = resolve(join(this.root, storageKey));
    if (!target.startsWith(`${this.root}/`)) throw new NotFoundException('Arquivo científico não encontrado.');
    return target;
  }
}
