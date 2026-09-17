import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MlmCalendarService } from './mlm-calendar.service';

const calendarYear = (year: number, holidays: string[] = []) => ({
  id: `calendar-${year}`,
  year,
  holidays,
  version: `test-${year}-v1`,
  source: 'Synthetic calendar fixture, not an approved DRC calendar',
  timezone: 'Africa/Lubumbashi',
  updatedAt: new Date('2026-09-17T00:00:00.000Z'),
});

type CalendarYear = ReturnType<typeof calendarYear>;

function calendarStore(rows: CalendarYear[]) {
  const records = new Map(rows.map((row) => [row.year, row]));
  const client = {
    mlmCalendarYear: {
      findUnique: jest.fn(
        async ({ where }: { where: { year: number } }) =>
          records.get(where.year) ?? null,
      ),
      findMany: jest.fn(async () =>
        [...records.values()].sort((left, right) => left.year - right.year),
      ),
      upsert: jest.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { year: number };
          create: Omit<CalendarYear, 'id' | 'updatedAt'>;
          update: Omit<CalendarYear, 'id' | 'updatedAt' | 'year'>;
        }) => {
          const existing = records.get(where.year);
          const result = existing
            ? { ...existing, ...update }
            : { ...calendarYear(where.year), ...create };
          records.set(where.year, result);
          return result;
        },
      ),
    },
  };
  return {
    ...client,
    $transaction: jest.fn(
      async (operation: (tx: typeof client) => Promise<CalendarYear>) =>
        operation(client),
    ),
  };
}

describe('MlmCalendarService.getReleaseSchedule', () => {
  it('binds a recycled human version to the actual normalized calendar contents', async () => {
    const prisma = calendarStore([calendarYear(2026)]);
    const service = new MlmCalendarService(prisma as never);
    const validation = new Date('2026-02-02T08:00:00Z');
    const original = await service.getReleaseSchedule(validation);
    const input = calendarYear(2026, ['2026-02-07']);
    await service.saveYear(2026, { ...input, version: 'v2' });
    await service.saveYear(2026, input);
    const changed = await service.getReleaseSchedule(validation);
    expect(original.calendarVersion).not.toBe(changed.calendarVersion);
    expect(JSON.parse(changed.calendarVersion)[0].fingerprint).toMatch(/^[a-f0-9]{64}$/);
    await service.saveYear(2026, { ...input, holidays: ['2026-02-07', '2026-02-07'] });
    expect((await service.getReleaseSchedule(validation)).calendarVersion).toBe(changed.calendarVersion);
  });
  it.each([
    [
      'Monday validation, excluding validation day',
      '2026-02-02T08:15:30.123Z',
      [],
      '2026-03-09T08:15:30.123Z',
    ],
    [
      'Saturday validation',
      '2026-02-07T08:15:00.000Z',
      [],
      '2026-03-14T08:15:00.000Z',
    ],
    [
      'Sunday validation and Saturday release',
      '2026-02-01T08:15:00.000Z',
      [],
      '2026-03-07T08:15:00.000Z',
    ],
    [
      'weekday holiday',
      '2026-02-02T08:15:00.000Z',
      ['2026-02-04'],
      '2026-03-10T08:15:00.000Z',
    ],
    [
      'Saturday holiday',
      '2026-02-02T08:15:00.000Z',
      ['2026-02-07'],
      '2026-03-10T08:15:00.000Z',
    ],
    [
      'duplicate holiday counts once',
      '2026-02-02T08:15:00.000Z',
      ['2026-02-07', '2026-02-07'],
      '2026-03-10T08:15:00.000Z',
    ],
    [
      'Sunday holiday is not automatically moved',
      '2026-02-02T08:15:00.000Z',
      ['2026-02-08'],
      '2026-03-09T08:15:00.000Z',
    ],
    [
      'explicit observed Monday is excluded',
      '2026-02-02T08:15:00.000Z',
      ['2026-02-08', '2026-02-09'],
      '2026-03-10T08:15:00.000Z',
    ],
    [
      'validation holiday is already excluded',
      '2026-02-02T08:15:00.000Z',
      ['2026-02-02'],
      '2026-03-09T08:15:00.000Z',
    ],
    [
      'release-day holiday moves the release',
      '2026-02-02T08:15:00.000Z',
      ['2026-03-09'],
      '2026-03-10T08:15:00.000Z',
    ],
    [
      'UTC Saturday is local Sunday',
      '2026-02-07T22:30:15.456Z',
      [],
      '2026-03-13T22:30:15.456Z',
    ],
    [
      'just before local midnight remains Saturday',
      '2026-02-07T21:59:59.999Z',
      [],
      '2026-03-14T21:59:59.999Z',
    ],
  ])('%s', async (_label, validation, holidays, release) => {
    const prisma = calendarStore([calendarYear(2026, holidays as string[])]);
    const service = new MlmCalendarService(prisma as never);
    const validatedAt = new Date(validation as string);

    const schedule = await service.getReleaseSchedule(validatedAt);

    expect(schedule.releaseDate.toISOString()).toBe(release);
    expect(schedule.timezone).toBe('Africa/Lubumbashi');
    expect(JSON.parse(schedule.calendarVersion)).toEqual([
      { year: 2026, version: 'test-2026-v1', fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) },
    ]);
    expect(validatedAt.toISOString()).toBe(validation);
    expect(prisma.mlmCalendarYear.findUnique).toHaveBeenCalledTimes(1);
  });

  it.each([
    [[], '2024-03-06T09:00:00.000Z'],
    [['2024-02-29'], '2024-03-07T09:00:00.000Z'],
  ])('handles leap day with holidays %j', async (holidays, release) => {
    const service = new MlmCalendarService(
      calendarStore([calendarYear(2024, holidays as string[])]) as never,
    );

    const schedule = await service.getReleaseSchedule(
      new Date('2024-01-31T09:00:00.000Z'),
    );

    expect(schedule.releaseDate.toISOString()).toBe(release);
  });

  it('captures every covered year including the validation year', async () => {
    const prisma = calendarStore([
      calendarYear(2026),
      calendarYear(2027, ['2027-01-01', '2027-01-16', '2027-01-17']),
    ]);
    const service = new MlmCalendarService(prisma as never);

    const schedule = await service.getReleaseSchedule(
      new Date('2026-12-31T08:00:00.000Z'),
    );

    expect(schedule.releaseDate.toISOString()).toBe('2027-02-06T08:00:00.000Z');
    expect(JSON.parse(schedule.calendarVersion)).toEqual([
      { year: 2026, version: 'test-2026-v1', fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) },
      { year: 2027, version: 'test-2027-v1', fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) },
    ]);
    expect(prisma.mlmCalendarYear.findUnique).toHaveBeenCalledTimes(2);
  });

  it('requires the local year rather than the UTC validation year', async () => {
    const service = new MlmCalendarService(
      calendarStore([calendarYear(2027)]) as never,
    );

    const schedule = await service.getReleaseSchedule(
      new Date('2026-12-31T22:30:00.000Z'),
    );

    expect(schedule.releaseDate.toISOString()).toBe('2027-02-04T22:30:00.000Z');
    expect(JSON.parse(schedule.calendarVersion)).toEqual([
      { year: 2027, version: 'test-2027-v1', fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) },
    ]);
  });

  it.each([
    [[], '2026-02-02T08:00:00.000Z', 2026],
    [[calendarYear(2026)], '2026-12-31T08:00:00.000Z', 2027],
    [[calendarYear(2027)], '2026-12-31T08:00:00.000Z', 2026],
  ])(
    'refuses a missing covered year',
    async (rows, validation, missingYear) => {
      const service = new MlmCalendarService(
        calendarStore(rows as CalendarYear[]) as never,
      );

      await expect(
        service.getReleaseSchedule(new Date(validation as string)),
      ).rejects.toThrow(String(missingYear));
    },
  );

  it('uses only the supplied transaction for calendar reads', async () => {
    const prisma = calendarStore([]);
    const tx = calendarStore([calendarYear(2026, ['2026-02-07'])]);
    const service = new MlmCalendarService(prisma as never);

    const schedule = await service.getReleaseSchedule(
      new Date('2026-02-02T08:00:00.000Z'),
      tx as never,
    );

    expect(schedule.releaseDate.toISOString()).toBe('2026-03-10T08:00:00.000Z');
    expect(prisma.mlmCalendarYear.findUnique).not.toHaveBeenCalled();
  });

  it('takes a fresh calendar snapshot for a later calculation without changing an earlier result', async () => {
    const prisma = calendarStore([calendarYear(2026)]);
    const service = new MlmCalendarService(prisma as never);
    const validation = new Date('2026-02-02T08:00:00.000Z');
    const first = await service.getReleaseSchedule(validation);

    await service.saveYear(2026, {
      holidays: ['2026-02-07'],
      version: 'test-2026-v2',
      source: 'Revised synthetic fixture',
    });
    const second = await service.getReleaseSchedule(validation);

    expect(first.releaseDate.toISOString()).toBe('2026-03-09T08:00:00.000Z');
    expect(JSON.parse(first.calendarVersion)).toEqual([
      { year: 2026, version: 'test-2026-v1', fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) },
    ]);
    expect(second.releaseDate.toISOString()).toBe('2026-03-10T08:00:00.000Z');
    expect(JSON.parse(second.calendarVersion)).toEqual([
      { year: 2026, version: 'test-2026-v2', fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) },
    ]);
  });

  it.each([new Date(NaN), null, '2026-02-02'])(
    'rejects invalid validation dates before reading calendars',
    async (input) => {
      const prisma = calendarStore([]);
      const service = new MlmCalendarService(prisma as never);

      await expect(service.getReleaseSchedule(input as Date)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.mlmCalendarYear.findUnique).not.toHaveBeenCalled();
    },
  );
});

describe('MlmCalendarService calendar configuration', () => {
  const validInput = {
    holidays: ['2026-05-01', '2026-01-01', '2026-05-01'],
    version: ' test-v1 ',
    source: ' Synthetic fixture ',
  };

  it('saves, sorts and deduplicates dates without inventing observances', async () => {
    const service = new MlmCalendarService(calendarStore([]) as never);

    const saved = await service.saveYear(2026, validInput);

    expect(saved).toMatchObject({
      year: 2026,
      holidays: ['2026-01-01', '2026-05-01'],
      timezone: 'Africa/Lubumbashi',
      version: 'test-v1',
      source: 'Synthetic fixture',
    });
    expect(await service.listYears()).toEqual([saved]);
    expect(validInput.holidays).toEqual([
      '2026-05-01',
      '2026-01-01',
      '2026-05-01',
    ]);
  });

  it('updates only the configured year and lists years in ascending order', async () => {
    const prisma = calendarStore([calendarYear(2027), calendarYear(2026)]);
    const service = new MlmCalendarService(prisma as never);

    await service.saveYear(2026, { ...validInput, version: 'revised' });
    const rows = await service.listYears();

    expect(rows.map((row) => [row.year, row.version])).toEqual([
      [2026, 'revised'],
      [2027, 'test-2027-v1'],
    ]);
    expect(prisma.mlmCalendarYear.findMany).toHaveBeenCalledWith({
      orderBy: { year: 'asc' },
    });
  });

  it('lists no calendars without synthesizing or writing any year', async () => {
    const prisma = calendarStore([]);
    const service = new MlmCalendarService(prisma as never);

    expect(await service.listYears()).toEqual([]);
    expect(prisma.mlmCalendarYear.upsert).not.toHaveBeenCalled();
  });

  it.each([{ holidays: ['2026-02-07'] }, { source: 'A different source' }])(
    'refuses changed content under the same calendar version %j',
    async (overrides) => {
      const original = calendarYear(2026);
      const prisma = calendarStore([original]);
      const service = new MlmCalendarService(prisma as never);

      await expect(
        service.saveYear(2026, { ...original, ...overrides }),
      ).rejects.toThrow(ConflictException);
      expect(await service.listYears()).toEqual([original]);
      expect(prisma.mlmCalendarYear.upsert).not.toHaveBeenCalled();
    },
  );

  it('allows idempotent same-version saves after normalization without writing', async () => {
    const original = calendarYear(2026, ['2026-01-01', '2026-05-01']);
    const prisma = calendarStore([original]);
    const service = new MlmCalendarService(prisma as never);

    const saved = await service.saveYear(2026, {
      ...original,
      holidays: ['2026-05-01', '2026-01-01', '2026-05-01'],
      source: ` ${original.source} `,
      version: ` ${original.version} `,
    });

    expect(saved).toEqual(original);
    expect(prisma.mlmCalendarYear.upsert).not.toHaveBeenCalled();
  });

  it('checks and saves revisions in a serializable transaction', async () => {
    const prisma = calendarStore([]);
    const service = new MlmCalendarService(prisma as never);

    await service.saveYear(2026, validInput);

    expect((await service.listYears())[0].version).toBe('test-v1');
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it.each(['P2034', 'P2002'])(
    'turns concurrent write conflict %s into an actionable conflict',
    async (code) => {
      const prisma = calendarStore([]);
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Write conflict', {
          code,
          clientVersion: 'test',
        }),
      );
      const service = new MlmCalendarService(prisma as never);

      await expect(service.saveYear(2026, validInput)).rejects.toThrow(
        ConflictException,
      );
      expect(await service.listYears()).toEqual([]);
    },
  );

  it('does not mask unrelated persistence errors as calendar conflicts', async () => {
    const prisma = calendarStore([]);
    const failure = new Error('Persistence unavailable');
    prisma.$transaction.mockRejectedValue(failure);
    const service = new MlmCalendarService(prisma as never);

    await expect(service.saveYear(2026, validInput)).rejects.toBe(failure);
  });

  it('accepts metadata at the documented length limits', async () => {
    const service = new MlmCalendarService(calendarStore([]) as never);

    const result = await service.saveYear(2026, {
      ...validInput,
      version: 'v'.repeat(100),
      source: 's'.repeat(2000),
    });

    expect(result.version.length).toBe(100);
    expect(result.source.length).toBe(2000);
  });

  it('accepts a real leap date', async () => {
    const service = new MlmCalendarService(calendarStore([]) as never);

    expect(
      await service.saveYear(2024, { ...validInput, holidays: ['2024-02-29'] }),
    ).toMatchObject({ holidays: ['2024-02-29'] });
  });

  it.each([0, -1, 2026.5, NaN, Infinity, 10000, '2026', null])(
    'rejects invalid year %s without writing',
    async (year) => {
      const prisma = calendarStore([]);
      const service = new MlmCalendarService(prisma as never);

      await expect(
        service.saveYear(year as number, validInput),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.mlmCalendarYear.upsert).not.toHaveBeenCalled();
    },
  );

  it.each([
    null,
    undefined,
    [],
    {},
    { ...validInput, holidays: null },
    { ...validInput, holidays: '2026-01-01' },
    { ...validInput, holidays: [null] },
    { ...validInput, holidays: [20260101] },
    { ...validInput, holidays: ['2026-2-01'] },
    { ...validInput, holidays: ['2026-02-29'] },
    { ...validInput, holidays: ['2026-04-31'] },
    { ...validInput, holidays: ['2026-13-01'] },
    { ...validInput, holidays: ['2026-00-01'] },
    { ...validInput, holidays: ['2026-01-00'] },
    { ...validInput, holidays: ['2026-01-01T00:00:00Z'] },
    { ...validInput, holidays: ['2027-01-01'] },
    { ...validInput, version: '' },
    { ...validInput, version: '   ' },
    { ...validInput, version: 1 },
    { ...validInput, version: 'v'.repeat(101) },
    { ...validInput, source: '' },
    { ...validInput, source: null },
    { ...validInput, source: 's'.repeat(2001) },
    { ...validInput, holidays: Array(367).fill('2026-01-01') },
    { ...validInput, timezone: 'Africa/Kinshasa' },
    { ...validInput, timezone: 'UTC' },
    { ...validInput, timezone: null },
  ])('rejects malformed configuration %j without writing', async (input) => {
    const prisma = calendarStore([]);
    const service = new MlmCalendarService(prisma as never);

    await expect(service.saveYear(2026, input as never)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.mlmCalendarYear.upsert).not.toHaveBeenCalled();
  });

  it.each([
    { holidays: ['2026-02-29'] },
    { holidays: ['2025-12-31'] },
    { holidays: { invalid: true } },
    { timezone: 'UTC' },
    { timezone: undefined },
    { source: '' },
    { version: '' },
  ])('fails closed on invalid stored calendars %j', async (overrides) => {
    const malformed = { ...calendarYear(2026), ...overrides } as CalendarYear;
    const service = new MlmCalendarService(calendarStore([malformed]) as never);

    await expect(
      service.getReleaseSchedule(new Date('2026-02-02T08:00:00.000Z')),
    ).rejects.toThrow(BadRequestException);
    await expect(service.listYears()).rejects.toThrow(BadRequestException);
  });
});
