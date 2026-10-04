import { Injectable, NotFoundException } from '@nestjs/common';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export abstract class RegistrationCategoryProofStorage {
  abstract write(storageKey: string, bytes: Buffer): Promise<void>;
  abstract read(storageKey: string): Promise<Buffer>;
  abstract remove(storageKey: string): Promise<void>;
}

@Injectable()
export class LocalRegistrationCategoryProofStorage extends RegistrationCategoryProofStorage {
  private readonly root = resolve(process.env.EVOLVIA_CATEGORY_PROOF_ROOT ?? '/app/data/registration-category-proofs');

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
      throw new NotFoundException('Comprovante da categoria não encontrado.');
    }
  }

  async remove(storageKey: string): Promise<void> {
    await rm(this.safePath(storageKey), { force: true });
  }

  private safePath(storageKey: string): string {
    if (!/^[a-z0-9]+\/[a-z0-9]+\/[0-9a-f-]{36}\.pdf$/u.test(storageKey)) {
      throw new NotFoundException('Comprovante da categoria não encontrado.');
    }
    const target = resolve(join(this.root, storageKey));
    if (!target.startsWith(`${this.root}/`)) throw new NotFoundException('Comprovante da categoria não encontrado.');
    return target;
  }
}
