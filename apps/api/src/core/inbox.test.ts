import { describe, expect, it } from 'vitest';
import { replyDeadline } from './inbox';

const at = (iso: string) => new Date(iso);

describe('replyDeadline (Instagram 24 saat kuralı)', () => {
  it('gelen mesaj yoksa yanıt verilemez', () => {
    expect(replyDeadline([{ direction: 'OUT', sentAt: at('2026-11-17T10:00:00Z') }])).toBeNull();
  });

  it('kişinin son mesajından 24 saat sonrası', () => {
    const d = replyDeadline([
      { direction: 'IN', sentAt: at('2026-11-16T09:00:00Z') },
      { direction: 'OUT', sentAt: at('2026-11-16T10:00:00Z') },
      { direction: 'IN', sentAt: at('2026-11-17T08:30:00Z') },
    ]);
    expect(d?.toISOString()).toBe('2026-11-18T08:30:00.000Z');
  });

  it('bizim mesajımız süreyi uzatmaz', () => {
    const d = replyDeadline([
      { direction: 'IN', sentAt: at('2026-11-17T08:00:00Z') },
      { direction: 'OUT', sentAt: at('2026-11-17T20:00:00Z') },
    ]);
    expect(d?.toISOString()).toBe('2026-11-18T08:00:00.000Z');
  });
});
