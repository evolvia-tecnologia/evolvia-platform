import { Injectable } from '@nestjs/common';
import { CreateEventDto } from './dto';
import { PrismaService } from './prisma.service';

function slugify(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60);
}

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}
  list(ownerId: string) { return this.prisma.event.findMany({ where: { ownerId }, orderBy: { createdAt: 'desc' } }); }
  async create(ownerId: string, dto: CreateEventDto) {
    const base = slugify(dto.name) || 'evento';
    return this.prisma.event.create({ data: {
      ownerId, name: dto.name.trim(), slug: `${base}-${Date.now().toString(36)}`,
      eventType: dto.eventType, format: dto.format,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      endDate: dto.endDate ? new Date(dto.endDate) : null,
      venue: dto.venue?.trim() || null,
      registrationMode: dto.registrationMode, status: 'SETUP'
    }});
  }
}
