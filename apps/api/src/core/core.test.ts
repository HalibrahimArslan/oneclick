import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { TokenCipher } from '../lib/crypto';
import { toLittleText } from '../providers/linkedin';
import { computePostStatus } from './scheduler';

describe('TokenCipher', () => {
  const cipher = new TokenCipher(randomBytes(32).toString('base64'));

  it('şifreler ve çözer', () => {
    const enc = cipher.encrypt('gizli-token');
    expect(enc).not.toContain('gizli');
    expect(cipher.decrypt(enc)).toBe('gizli-token');
  });

  it('değiştirilmiş veriyi reddeder', () => {
    const enc = cipher.encrypt('gizli-token');
    const parts = enc.split('.');
    parts[3] = Buffer.from('baska').toString('base64url');
    expect(() => cipher.decrypt(parts.join('.'))).toThrow();
  });
});

describe('computePostStatus', () => {
  it('taslak, hedefler beklerken taslak kalır', () => {
    expect(computePostStatus('DRAFT', ['PENDING', 'PENDING'])).toBe('DRAFT');
  });
  it('kuyruktakiler planlanmış sayılır', () => {
    expect(computePostStatus('DRAFT', ['QUEUED', 'QUEUED'])).toBe('SCHEDULED');
  });
  it('yayınlanırken', () => {
    expect(computePostStatus('SCHEDULED', ['PUBLISHING', 'QUEUED'])).toBe('PUBLISHING');
    expect(computePostStatus('SCHEDULED', ['PUBLISHED', 'QUEUED'])).toBe('PUBLISHING');
  });
  it('sonuçlar', () => {
    expect(computePostStatus('PUBLISHING', ['PUBLISHED', 'PUBLISHED'])).toBe('PUBLISHED');
    expect(computePostStatus('PUBLISHING', ['FAILED', 'FAILED'])).toBe('FAILED');
    expect(computePostStatus('PUBLISHING', ['PUBLISHED', 'FAILED'])).toBe('PARTIALLY_FAILED');
  });
});

describe('toLittleText', () => {
  it('hashtagleri şablona çevirir', () => {
    expect(toLittleText('Yeni ürün #lansman')).toBe('Yeni ürün {hashtag|\\#|lansman}');
  });
  it('ayrılmış karakterleri kaçışlar', () => {
    expect(toLittleText('Fiyat (KDV dahil) [yeni] @ekip')).toBe('Fiyat \\(KDV dahil\\) \\[yeni\\] \\@ekip');
  });
});
