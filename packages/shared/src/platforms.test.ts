import { describe, expect, it } from 'vitest';
import { hasErrors, validateForPlatform } from './platforms';

const jpg = { mime: 'image/jpeg', width: 1080, height: 1080, sizeBytes: 200_000 };
const mp4 = (d: number) => ({ mime: 'video/mp4', durationS: d, sizeBytes: 5_000_000 });
const codes = (xs: { code: string }[]) => xs.map((x) => x.code);

describe('validateForPlatform', () => {
  it('Instagram medya ister', () => {
    expect(codes(validateForPlatform('INSTAGRAM', { text: 'merhaba', media: [] }))).toContain('media_required');
  });

  it('Instagram tek görselle geçerli', () => {
    expect(hasErrors(validateForPlatform('INSTAGRAM', { text: 'merhaba', media: [jpg] }))).toBe(false);
  });

  it('Instagram PNG kabul etmez', () => {
    const r = validateForPlatform('INSTAGRAM', { text: '', media: [{ mime: 'image/png' }] });
    expect(codes(r)).toContain('unsupported_format');
  });

  it('Instagram 30 hashtag sınırı', () => {
    const text = Array.from({ length: 31 }, (_, i) => `#etiket${i}`).join(' ');
    expect(codes(validateForPlatform('INSTAGRAM', { text, media: [jpg] }))).toContain('too_many_hashtags');
  });

  it('Reel tek video ister', () => {
    const r = validateForPlatform('INSTAGRAM', { text: '', media: [jpg], options: { postType: 'REEL' } });
    expect(codes(r)).toContain('reel_needs_video');
  });

  it('LinkedIn yalnızca metinle geçerli, 3000 karakter sınırı', () => {
    expect(hasErrors(validateForPlatform('LINKEDIN', { text: 'Duyuru', media: [] }))).toBe(false);
    expect(codes(validateForPlatform('LINKEDIN', { text: 'a'.repeat(3001), media: [] }))).toContain('text_too_long');
  });

  it('LinkedIn boş gönderiyi reddeder', () => {
    expect(codes(validateForPlatform('LINKEDIN', { text: '  ', media: [] }))).toContain('empty_post');
  });

  it('LinkedIn görsel ve videoyu karıştırmaz', () => {
    expect(codes(validateForPlatform('LINKEDIN', { text: 'x', media: [jpg, mp4(10)] }))).toContain('mixed_media');
  });

  it('TikTok görünürlük ve müzik onayı ister', () => {
    const r = validateForPlatform('TIKTOK', { text: '', media: [mp4(20)], options: {} });
    expect(codes(r)).toEqual(expect.arrayContaining(['tiktok_privacy_required', 'tiktok_music_consent']));
  });

  it('TikTok video süre sınırı', () => {
    const r = validateForPlatform('TIKTOK', {
      text: '',
      media: [mp4(1)],
      options: { privacyLevel: 'SELF_ONLY', musicConsent: true },
    });
    expect(codes(r)).toContain('video_duration');
  });

  it('TikTok markalı içerik gizli olamaz', () => {
    const r = validateForPlatform('TIKTOK', {
      text: '',
      media: [mp4(20)],
      options: { privacyLevel: 'SELF_ONLY', musicConsent: true, brandContentToggle: true },
    });
    expect(codes(r)).toContain('tiktok_branded_private');
  });

  it('TikTok geçerli gönderi', () => {
    const r = validateForPlatform('TIKTOK', {
      text: 'deneme',
      media: [mp4(20)],
      options: { privacyLevel: 'PUBLIC_TO_EVERYONE', musicConsent: true },
    });
    expect(hasErrors(r)).toBe(false);
  });
});
