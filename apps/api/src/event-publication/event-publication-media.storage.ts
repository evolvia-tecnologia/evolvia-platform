import { Injectable, NotFoundException } from '@nestjs/common';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export abstract class EventPublicationMediaStorage {
  abstract write(storageKey: string, bytes: Buffer): Promise<void>;
  abstract read(storageKey: string): Promise<Buffer>;
  abstract rollbackNewWrite(storageKey: string): Promise<void>;
}

@Injectable()
export class LocalEventPublicationMediaStorage extends EventPublicationMediaStorage {
  private readonly root = resolve(process.env.EVOLVIA_MEDIA_ROOT ?? '/app/data/media');

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
      throw new NotFoundException('Mídia não encontrada.');
    }
  }

  async rollbackNewWrite(storageKey: string): Promise<void> {
    await rm(this.safePath(storageKey), { force: true });
  }

  private safePath(storageKey: string): string {
    if (!/^[a-z0-9_-]+\/[a-z0-9_-]+\/[a-f0-9-]+\.(png|jpg|webp)$/u.test(storageKey)) {
      throw new NotFoundException('Mídia não encontrada.');
    }
    const target = resolve(join(this.root, storageKey));
    if (!target.startsWith(`${this.root}/`)) throw new NotFoundException('Mídia não encontrada.');
    return target;
  }
}
