import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function formatLabPattern(
  pattern: string,
  sequence: number,
  date = new Date(),
) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  const year = part('year'),
    be = String(Number(year) + 543);
  // Protect sequence tokens before replacing date tokens (dates may contain zeroes).
  let width = 4;
  let result = pattern.replace(/\{SEQ\}|0{2,}/g, (token) => {
    width = token === '{SEQ}' ? 4 : token.length;
    return '@SEQ@';
  });
  if (!result.includes('@SEQ@'))
    throw new BadRequestException(
      'รูปแบบ Lab Number ต้องมีเลขลำดับ เช่น 0000 หรือ {SEQ}',
    );
  const values: Record<string, string> = {
    cyyyy: year,
    cyy: year.slice(-2),
    yyyy: be,
    yy: be.slice(-2),
    YYYY: year,
    YY: year.slice(-2),
    MM: part('month'),
    mm: part('month'),
    DD: part('day'),
    dd: part('day'),
  };
  result = result.replace(
    /\{(YYYY|YY|MM|DD|yyyy|yy|mm|dd)\}|cyyyy|cyy|yyyy|YYYY|yy|YY|MM|mm|DD|dd/g,
    (token, wrapped) => values[wrapped || token],
  );
  return result.replace(/@SEQ@/g, String(sequence).padStart(width, '0'));
}

export async function nextLabNumber(
  tx: Prisma.TransactionClient,
  pattern: string,
) {
  // Serialize allocation across server processes; the lock is released with the order transaction.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(8362101)::text`;
  let sequence = (await tx.sample.count()) + 1;
  for (;;) {
    const number = formatLabPattern(pattern, sequence++);
    if (
      !(await tx.sample.findUnique({
        where: { labNumber: number },
        select: { id: true },
      }))
    )
      return number;
  }
}
