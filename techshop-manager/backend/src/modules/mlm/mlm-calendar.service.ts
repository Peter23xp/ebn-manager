import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { MlmCalendarYear, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { createHash } from 'crypto';

const TIMEZONE = 'Africa/Lubumbashi';
const localDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
});

export interface MlmCalendarYearInput {
  holidays: string[];
  version: string;
  source: string;
  timezone?: string;
}

@Injectable()
export class MlmCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async getReleaseSchedule(
    validatedAt: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<{
    releaseDate: Date;
    calendarVersion: string;
    timezone: string;
  }> {
    if (
      !(validatedAt instanceof Date) ||
      !Number.isFinite(validatedAt.getTime())
    ) {
      throw new BadRequestException(
        'La date de validation du calendrier est invalide.',
      );
    }

    const client = tx ?? this.prisma;
    const calendars = new Map<
      number,
      { holidays: Set<string>; version: string; fingerprint: string }
    >();
    const loadYear = async (year: number) => {
      if (!calendars.has(year)) {
        const row = await client.mlmCalendarYear.findUnique({
          where: { year },
        });
        if (!row) {
          throw new BadRequestException(
            `Calendrier MLM manquant pour ${year}. Configurez cette annee avant validation.`,
          );
        }
        const calendar = this.validateCalendar(year, row, true);
        calendars.set(year, {
          holidays: new Set(calendar.holidays),
          version: calendar.version,
          fingerprint: createHash('sha256').update(JSON.stringify({
            year, holidays: calendar.holidays, source: calendar.source, timezone: calendar.timezone,
          })).digest('hex'),
        });
      }
      return calendars.get(year);
    };

    const releaseDate = new Date(validatedAt.getTime());
    await loadYear(this.localDate(releaseDate).year);
    let workingDays = 0;
    while (workingDays < 30) {
      releaseDate.setUTCDate(releaseDate.getUTCDate() + 1);
      const local = this.localDate(releaseDate);
      const calendar = await loadYear(local.year);
      if (local.weekday !== 'Sun' && !calendar.holidays.has(local.date)) {
        workingDays += 1;
      }
    }

    return {
      releaseDate,
      calendarVersion: JSON.stringify(
        [...calendars].map(([year, calendar]) => ({
          year,
          version: calendar.version,
          fingerprint: calendar.fingerprint,
        })),
      ),
      timezone: TIMEZONE,
    };
  }

  async listYears(): Promise<MlmCalendarYear[]> {
    const rows = await this.prisma.mlmCalendarYear.findMany({
      orderBy: { year: 'asc' },
    });
    return rows.map((row) => ({
      ...row,
      ...this.validateCalendar(row.year, row, true),
    }));
  }

  async saveYear(
    year: number,
    input: MlmCalendarYearInput,
  ): Promise<MlmCalendarYear> {
    const data = this.validateCalendar(year, input);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.mlmCalendarYear.findUnique({
            where: { year },
          });
          if (existing && existing.version.trim() === data.version) {
            const previous = this.validateCalendar(year, existing, true);
            if (JSON.stringify(previous) !== JSON.stringify(data)) {
              throw new ConflictException(
                `Le calendrier ${year} a change : une nouvelle version est obligatoire.`,
              );
            }
            return { ...existing, ...data };
          }
          return tx.mlmCalendarYear.upsert({
            where: { year },
            create: { year, ...data },
            update: data,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2034' || error.code === 'P2002')
      ) {
        throw new ConflictException(
          `Le calendrier ${year} a ete modifie simultanement. Rechargez sa version avant de reessayer.`,
        );
      }
      throw error;
    }
  }

  private validateYear(year: number) {
    if (!Number.isInteger(year) || year < 1 || year > 9999) {
      throw new BadRequestException(
        'Annee du calendrier invalide : entier de 1 a 9999 requis.',
      );
    }
  }

  private validateCalendar(
    year: number,
    input: unknown,
    stored = false,
  ): Required<MlmCalendarYearInput> {
    this.validateYear(year);
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException(
        `Configuration du calendrier ${year} invalide.`,
      );
    }
    const calendar = input as MlmCalendarYearInput;
    const timezone =
      !stored && calendar.timezone === undefined ? TIMEZONE : calendar.timezone;
    if (timezone !== TIMEZONE) {
      throw new BadRequestException(
        `Le calendrier ${year} doit utiliser ${TIMEZONE}.`,
      );
    }
    if (
      typeof calendar.version !== 'string' ||
      !calendar.version.trim() ||
      calendar.version.length > 100 ||
      typeof calendar.source !== 'string' ||
      !calendar.source.trim() ||
      calendar.source.length > 2000
    ) {
      throw new BadRequestException(
        `Version (1 a 100 caracteres) et source documentee (1 a 2000 caracteres) obligatoires pour le calendrier ${year}.`,
      );
    }
    if (!Array.isArray(calendar.holidays) || calendar.holidays.length > 366) {
      throw new BadRequestException(
        `Les jours feries du calendrier ${year} doivent etre une liste de 366 dates YYYY-MM-DD maximum.`,
      );
    }
    for (const holiday of calendar.holidays) {
      if (typeof holiday !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(holiday)) {
        throw new BadRequestException(
          `Date feriee invalide dans le calendrier ${year} : format YYYY-MM-DD requis.`,
        );
      }
      const parsed = new Date(`${holiday}T00:00:00.000Z`);
      if (
        !Number.isFinite(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== holiday ||
        parsed.getUTCFullYear() !== year
      ) {
        throw new BadRequestException(
          `Date feriee inexistante ou hors de l'annee ${year}.`,
        );
      }
    }
    return {
      holidays: [...new Set(calendar.holidays)].sort(),
      version: calendar.version.trim(),
      source: calendar.source.trim(),
      timezone,
    };
  }

  private localDate(date: Date) {
    const parts = localDateFormatter.formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type).value;
    const year = Number(value('year'));
    this.validateYear(year);
    return {
      year,
      date: `${String(year).padStart(4, '0')}-${value('month')}-${value('day')}`,
      weekday: value('weekday'),
    };
  }
}
