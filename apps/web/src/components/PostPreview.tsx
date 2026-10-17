import { PLATFORM_LABELS, type MediaAssetDto, type Platform } from '@oneclick/shared';
import { Bookmark, Heart, MessageCircle, MoreHorizontal, Music2, Pencil, Repeat2, Send, Share2, ThumbsUp } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Avatar, PlatformIcon } from './identity';
import { MediaThumb } from './MediaLibrary';
import { cx } from './ui';

export interface PreviewAccount {
  name: string;
  username: string | null;
  avatarUrl: string | null;
  platform: Platform;
}

/** Gönderinin platformdaki görünümüne yakın önizleme (DESIGN.md §5.3). */
export function PostPreview({
  account,
  text,
  media,
  postType,
  customized,
  onEdit,
  bare,
}: {
  account: PreviewAccount;
  text: string;
  media: MediaAssetDto[];
  postType?: string;
  customized?: boolean;
  onEdit?(): void;
  /** Başlık satırı olmadan yalnızca platform görünümü */
  bare?: boolean;
}) {
  const body =
    account.platform === 'TIKTOK' ? (
      <TikTokPreview account={account} text={text} media={media} />
    ) : account.platform === 'LINKEDIN' ? (
      <LinkedInPreview account={account} text={text} media={media} />
    ) : (
      <InstagramPreview account={account} text={text} media={media} vertical={postType === 'REEL' || postType === 'STORY'} />
    );
  if (bare) return body;
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <PlatformIcon platform={account.platform} size={16} />
        <span className="min-w-0 flex-1 truncate text-small font-medium">
          {PLATFORM_LABELS[account.platform]} <span className="font-normal text-muted">· {account.name}</span>
        </span>
        {customized && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-micro font-medium text-brand-700">Özelleştirildi</span>}
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="flex size-7 items-center justify-center rounded-control text-muted hover:bg-surface hover:text-ink"
            aria-label={`${account.name} için metni düzenle`}
            title="Bu hesap için düzenle"
          >
            <Pencil className="size-3.5" strokeWidth={1.75} />
          </button>
        )}
      </div>
      {body}
    </section>
  );
}

function Truncated({ text, limit, more, children }: { text: string; limit: number; more: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const long = text.length > limit;
  return (
    <p className="whitespace-pre-wrap break-words">
      {children}
      {long && !open ? text.slice(0, limit).trimEnd() : text}
      {long && !open && (
        <button type="button" className="text-muted" onClick={() => setOpen(true)}>
          … {more}
        </button>
      )}
    </p>
  );
}

const Placeholder = ({ className, dark }: { className: string; dark?: boolean }) => (
  <div className={cx('flex items-center justify-center text-caption', dark ? 'bg-ink text-faint' : 'bg-subtle text-faint', className)}>
    Medya eklenmedi
  </div>
);

function InstagramPreview({ account, text, media, vertical }: { account: PreviewAccount; text: string; media: MediaAssetDto[]; vertical: boolean }) {
  const handle = account.username ?? account.name;
  const first = media[0];
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface text-[13px] leading-[18px] text-ink">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <span className="rounded-full bg-[conic-gradient(from_200deg,#f9ce34,#ee2a7b,#6228d7,#f9ce34)] p-[2px]">
          <span className="block rounded-full bg-surface p-[1.5px]">
            <Avatar name={account.name} url={account.avatarUrl} size={26} />
          </span>
        </span>
        <span className="flex-1 truncate font-semibold">{handle}</span>
        <MoreHorizontal className="size-4" />
      </div>
      <div className={cx('relative bg-subtle', vertical ? 'aspect-[9/16] max-h-[420px] w-full' : 'aspect-square')}>
        {first ? <MediaThumb m={first} className="size-full" /> : <Placeholder className="size-full" />}
        {media.length > 1 && (
          <span className="absolute top-2.5 right-2.5 rounded-full bg-ink/70 px-2 py-0.5 text-micro font-medium text-white">1/{media.length}</span>
        )}
      </div>
      <div className="flex items-center gap-3.5 px-3 pt-2.5">
        <Heart className="size-5" strokeWidth={1.75} />
        <MessageCircle className="size-5 -scale-x-100" strokeWidth={1.75} />
        <Send className="size-5" strokeWidth={1.75} />
        <span className="flex-1" />
        <Bookmark className="size-5" strokeWidth={1.75} />
      </div>
      <div className="px-3 pt-2 pb-3">
        {text ? (
          <Truncated text={text} limit={125} more="devamı">
            <span className="mr-1 font-semibold">{handle}</span>
          </Truncated>
        ) : (
          <p className="text-faint">Açıklama yok</p>
        )}
        <p className="mt-1.5 text-[11px] text-faint">Şimdi</p>
      </div>
    </div>
  );
}

function TikTokPreview({ account, text, media }: { account: PreviewAccount; text: string; media: MediaAssetDto[] }) {
  const first = media[0];
  return (
    <div className="relative mx-auto aspect-[9/16] max-h-[460px] overflow-hidden rounded-card bg-ink text-white">
      {first ? <MediaThumb m={first} className="size-full" /> : <Placeholder className="size-full" dark />}
      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/75 via-black/30 to-transparent px-3 pt-12 pb-3 text-[12.5px] leading-[17px]">
        <p className="mb-1 font-semibold">@{account.username ?? account.name}</p>
        {text ? <Truncated text={text} limit={90} more="daha fazla" /> : <p className="opacity-60">Açıklama yok</p>}
        <p className="mt-2 flex items-center gap-1.5 text-[11px] opacity-90">
          <Music2 className="size-3" /> orijinal ses · {account.name}
        </p>
      </div>
      <div className="absolute right-2 bottom-24 flex flex-col items-center gap-4">
        <Avatar name={account.name} url={account.avatarUrl} size={34} />
        {[Heart, MessageCircle, Bookmark, Share2].map((I, i) => (
          <I key={i} className="size-6 drop-shadow" fill="currentColor" strokeWidth={0} />
        ))}
      </div>
    </div>
  );
}

function LinkedInPreview({ account, text, media }: { account: PreviewAccount; text: string; media: MediaAssetDto[] }) {
  const first = media[0];
  return (
    <div className="@container overflow-hidden rounded-card border border-line bg-surface text-[13px] leading-[19px] text-ink">
      <div className="flex items-start gap-2.5 px-3 pt-3">
        <Avatar name={account.name} url={account.avatarUrl} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{account.name}</p>
          <p className="truncate text-[11.5px] text-muted">{account.username ? `@${account.username}` : 'LinkedIn'}</p>
          <p className="text-[11.5px] text-muted">Şimdi · 🌐</p>
        </div>
        <MoreHorizontal className="size-4 text-muted" />
      </div>
      <div className="px-3 pt-2.5 pb-3">{text ? <Truncated text={text} limit={210} more="daha fazla" /> : <p className="text-faint">Metin yok</p>}</div>
      {first && (
        <div className="relative bg-subtle">
          <MediaThumb m={first} className="max-h-[360px] w-full" />
          {media.length > 1 && (
            <span className="absolute top-2.5 right-2.5 rounded-full bg-ink/70 px-2 py-0.5 text-micro font-medium text-white">+{media.length - 1}</span>
          )}
        </div>
      )}
      {/* Etiketler kabın genişliğine göre görünür; dar sütunda yalnızca ikonlar kalır */}
      <div className="mx-2 flex items-center border-t border-line py-1 text-[12px] font-medium text-muted">
        {[
          [ThumbsUp, 'Beğen'],
          [MessageCircle, 'Yorum yap'],
          [Repeat2, 'Paylaş'],
          [Send, 'Gönder'],
        ].map(([I, l]) => {
          const Icon = I as typeof ThumbsUp;
          return (
            <span key={l as string} title={l as string} className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap">
              <Icon className="size-4 shrink-0" strokeWidth={1.75} />
              <span className="hidden @[340px]:inline">{l as string}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
