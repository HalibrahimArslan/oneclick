import { ROLE_LABELS, type CreatedInviteDto, type MemberDto, type Role } from '@oneclick/shared';
import { useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Check, Copy, Crown, Eye, Link2, LogOut, Minus, PenLine, ShieldCheck, Trash2, UserPlus, type LucideIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFeedback } from '../components/feedback';
import { Avatar } from '../components/identity';
import { Button, Card, cx, Field, IconButton, Input, Modal, Notice, PageHeader, Select, Skeleton, Switch } from '../components/ui';
import { api, ws } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtLong } from '../lib/format';
import { useInvites, useMembers } from '../lib/queries';

const ASSIGNABLE: Exclude<Role, 'OWNER'>[] = ['ADMIN', 'EDITOR', 'APPROVER', 'VIEWER'];

const ROLES: Role[] = ['OWNER', 'ADMIN', 'EDITOR', 'APPROVER', 'VIEWER'];

const ROLE_META: Record<Role, { icon: LucideIcon; help: string }> = {
  OWNER: { icon: Crown, help: 'Her şey; marka ve çalışma alanı sahipliği dahil' },
  ADMIN: { icon: ShieldCheck, help: 'Her şey; ekip, hesaplar ve ayarlar dahil' },
  EDITOR: { icon: PenLine, help: 'Gönderi hazırlar ve planlar, yorumları yanıtlar' },
  APPROVER: { icon: BadgeCheck, help: 'Gönderileri onaylar veya reddeder; düzenleyemez' },
  VIEWER: { icon: Eye, help: 'Her şeyi görür, hiçbir şeyi değiştiremez' },
};
const ROLE_HELP = Object.fromEntries(ROLES.map((r) => [r, ROLE_META[r].help])) as Record<Role, string>;

/**
 * Yetki tablosu: API'deki MinRole ve canApprove/canPublishDirectly kurallarının özeti.
 * Bir uç noktanın rolü değişirse burası da güncellenmeli.
 * Hücre: true = var, false = yok, string = koşullu (kısa not).
 */
type Cell = boolean | string;
function permissions(approvalRequired: boolean): { label: string; cells: Record<Role, Cell> }[] {
  const all = (v: Cell): Record<Role, Cell> => ({ OWNER: v, ADMIN: v, EDITOR: v, APPROVER: v, VIEWER: v });
  return [
    { label: 'Takvim, gönderiler, raporlar ve yorumları görme', cells: all(true) },
    {
      label: 'Gönderi hazırlama, planlama ve medya yükleme',
      cells: { ...all(false), OWNER: true, ADMIN: true, EDITOR: approvalRequired ? 'Onaya gönderir' : true },
    },
    { label: 'Onay beklemeden yayınlama', cells: { ...all(false), OWNER: true, ADMIN: true, EDITOR: approvalRequired ? false : 'Onay kapalıyken' } },
    { label: 'Gönderi onaylama ve reddetme', cells: { ...all(false), OWNER: true, ADMIN: true, APPROVER: true } },
    { label: 'Yorumları yanıtlama, gizleme ve atama', cells: { ...all(false), OWNER: true, ADMIN: true, EDITOR: true } },
    { label: 'Hesaplar, müşteriler, platform uygulamaları ve onay ayarı', cells: { ...all(false), OWNER: true, ADMIN: true } },
    { label: 'Ekibi yönetme ve davet etme', cells: { ...all(false), OWNER: true, ADMIN: true } },
    { label: 'Marka (ad, logo, renk)', cells: { ...all(false), OWNER: true } },
  ];
}

function RoleIcon({ role, className }: { role: Role; className?: string }) {
  const Icon = ROLE_META[role].icon;
  return <Icon className={cx('size-3.5 shrink-0', className)} strokeWidth={2} aria-hidden />;
}

export function TeamPage() {
  const { workspace } = useAuth();
  const canManage = workspace?.role === 'OWNER' || workspace?.role === 'ADMIN';
  const isDemo = Boolean(workspace?.demoExpiresAt);

  return (
    <div className="mx-auto max-w-220 space-y-5">
      <PageHeader title="Ekip" subtitle="Çalışma alanındaki kişiler, rolleri ve gönderi onay ayarı." />
      {isDemo && <Notice tone="info">Demo hesabında ekip daveti ve rol değişikliği kapalı. Kendi kurulumunuzda ekibinizi davet linkiyle eklersiniz.</Notice>}
      <ApprovalSetting canManage={canManage} />
      <Members canManage={canManage && !isDemo} />
      {canManage && !isDemo && <Invites />}
      <RolesTable />
    </div>
  );
}

function ApprovalSetting({ canManage }: { canManage: boolean }) {
  const { workspace, reload } = useAuth();
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const on = Boolean(workspace?.approvalRequired);

  const toggle = async (v: boolean) => {
    setBusy(true);
    try {
      await api(ws(''), { method: 'PATCH', body: { approvalRequired: v } });
      await reload();
      toast(v ? 'Onay zorunlu: Editörlerin gönderileri onaydan sonra yayınlanır.' : 'Onay kapatıldı: Editörler doğrudan planlayabilir.', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-heading font-semibold">Gönderi onayı</h2>
          <p className="mt-1 text-small text-muted">
            Açıkken Editörler gönderiyi planlayamaz veya hemen yayınlayamaz; “Onaya gönder” der. Onaylayıcı, Yönetici veya Sahip onaylayınca gönderi planlanan
            zamanda yayınlanır. Yönetici ve Sahip kendi gönderilerini onaysız yayınlayabilir.
          </p>
        </div>
        <Switch checked={on} onChange={toggle} disabled={!canManage || busy} label={on ? 'Açık' : 'Kapalı'} />
      </div>
    </Card>
  );
}

function Members({ canManage }: { canManage: boolean }) {
  const { user, workspace, reload } = useAuth();
  const members = useMembers();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const [busyId, setBusyId] = useState<string | null>(null);
  const isOwner = workspace?.role === 'OWNER';
  const ownerCount = (members.data ?? []).filter((m) => m.role === 'OWNER').length;

  const run = async (id: string, fn: () => Promise<unknown>, done: string) => {
    setBusyId(id);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['members'] });
      toast(done, 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const changeRole = (m: MemberDto, role: Role) =>
    run(m.id, () => api(ws(`/members/${m.id}`), { method: 'PATCH', body: { role } }), `${m.name} artık ${ROLE_LABELS[role]}.`);

  const remove = async (m: MemberDto) => {
    const self = m.id === user?.id;
    const ok = await confirm(
      self
        ? { title: 'Çalışma alanından ayrılınsın mı?', body: 'Bu çalışma alanına yeniden erişmek için yeni bir davet gerekir.', action: 'Ayrıl', danger: true }
        : {
            title: `${m.name} çıkarılsın mı?`,
            body: 'Çalışma alanına erişimi hemen kapanır. Hazırladığı gönderiler yerinde kalır.',
            action: 'Çıkar',
            danger: true,
          },
    );
    if (!ok) return;
    if (self) {
      setBusyId(m.id);
      try {
        await api(ws(`/members/${m.id}`), { method: 'DELETE' });
        await reload();
        navigate('/calendar', { replace: true });
      } catch (err) {
        toast((err as Error).message, 'error');
        setBusyId(null);
      }
      return;
    }
    await run(m.id, () => api(ws(`/members/${m.id}`), { method: 'DELETE' }), `${m.name} çıkarıldı.`);
  };

  return (
    <Card title="Üyeler">
      {members.isLoading ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : members.isError ? (
        <div className="p-4">
          <Notice tone="error">{(members.error as Error).message}</Notice>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {(members.data ?? []).map((m) => {
            const self = m.id === user?.id;
            // Sahiplere yalnızca Sahip dokunabilir; son Sahip değiştirilemez (API de engeller)
            const editable = canManage && (m.role !== 'OWNER' || (isOwner && ownerCount > 1));
            const lastOwner = m.role === 'OWNER' && ownerCount <= 1;
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                <Avatar name={m.name} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-2 text-body font-medium">
                    <span className="truncate">{m.name}</span>
                    {self && <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-micro font-semibold text-brand-700">Siz</span>}
                  </p>
                  <p className="truncate text-caption text-muted">{m.email}</p>
                </div>
                {editable ? (
                  <div className="flex items-center gap-1.5 text-muted">
                    <RoleIcon role={m.role} />
                    <Select
                      fit
                      aria-label={`${m.name} rolü`}
                      value={m.role === 'OWNER' ? '' : m.role}
                      disabled={busyId === m.id}
                      onChange={(e) => changeRole(m, e.target.value as Role)}
                      className="h-8 text-small font-medium"
                      title={ROLE_HELP[m.role]}
                    >
                      {m.role === 'OWNER' && (
                        <option value="" disabled>
                          Sahip
                        </option>
                      )}
                      {ASSIGNABLE.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : (
                  <RoleChip role={m.role} />
                )}
                {self
                  ? !lastOwner && <IconButton icon={LogOut} size="sm" label="Çalışma alanından ayrıl" disabled={busyId === m.id} onClick={() => remove(m)} />
                  : editable && (
                      <IconButton icon={Trash2} size="sm" label={`${m.name} adlı üyeyi çıkar`} disabled={busyId === m.id} onClick={() => remove(m)} />
                    )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function RoleChip({ role }: { role: Role }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-medium',
        role === 'OWNER' ? 'bg-brand-50 text-brand-700' : 'bg-subtle text-ink-2',
      )}
      title={ROLE_HELP[role]}
    >
      <RoleIcon role={role} />
      {ROLE_LABELS[role]}
    </span>
  );
}

/** Rollerin yetkileri: satırlar yetki, sütunlar rol; kullanıcının kendi rolü vurgulanır */
function RolesTable() {
  const { workspace } = useAuth();
  const mine = workspace?.role;
  const rows = permissions(Boolean(workspace?.approvalRequired));
  const col = (r: Role) => (r === mine ? 'bg-brand-50/60' : '');

  return (
    <Card title="Roller ve yetkiler">
      <div className="overflow-x-auto">
        <table className="w-full min-w-160 table-fixed border-collapse text-small">
          <caption className="sr-only">Her rolün çalışma alanında yapabildikleri</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="w-[34%] px-4 py-3 text-left align-bottom text-caption font-medium text-muted">
                Yetki
              </th>
              {ROLES.map((r) => (
                <th key={r} scope="col" className={cx('px-2 py-3 text-center align-bottom', col(r))}>
                  <span className="flex flex-col items-center gap-1">
                    <span
                      className={cx('flex size-7 items-center justify-center rounded-full', r === mine ? 'bg-brand-600 text-white' : 'bg-subtle text-ink-2')}
                    >
                      <RoleIcon role={r} className="size-4" />
                    </span>
                    <span className="text-small font-semibold text-ink">{ROLE_LABELS[r]}</span>
                    {r === mine && <span className="text-micro font-medium text-brand-700">Sizin rolünüz</span>}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="px-4 py-2.5 text-left font-normal text-ink-2">
                  {row.label}
                </th>
                {ROLES.map((r) => {
                  const v = row.cells[r];
                  return (
                    <td key={r} className={cx('px-2 py-2.5 text-center', col(r))}>
                      {v === true ? (
                        <Check className="mx-auto size-4 text-brand-600" strokeWidth={2.5} aria-label="Var" />
                      ) : v === false ? (
                        <Minus className="mx-auto size-4 text-line-strong" aria-label="Yok" />
                      ) : (
                        <span className="inline-block rounded-full bg-subtle px-2 py-0.5 text-micro font-medium whitespace-nowrap text-ink-2">
                          {v}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-4 py-3 text-caption text-muted">
        Sahiplerin rolünü yalnızca başka bir Sahip değiştirebilir; çalışma alanında her zaman en az bir Sahip kalır.
        {workspace?.approvalRequired ? ' Gönderi onayı açık: Editörlerin gönderileri onaylandıktan sonra yayınlanır.' : ''}
      </p>
    </Card>
  );
}

function Invites() {
  const invites = useInvites(true);
  const qc = useQueryClient();
  const { toast, confirm } = useFeedback();
  const [creating, setCreating] = useState(false);

  const revoke = async (id: string) => {
    const ok = await confirm({ title: 'Davet iptal edilsin mi?', body: 'Link artık çalışmaz.', action: 'İptal et', danger: true });
    if (!ok) return;
    try {
      await api(ws(`/invites/${id}`), { method: 'DELETE' });
      await qc.invalidateQueries({ queryKey: ['invites'] });
      toast('Davet iptal edildi.', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  return (
    <Card
      title="Davetler"
      actions={
        <Button size="sm" variant="primary" icon={UserPlus} onClick={() => setCreating(true)}>
          Davet oluştur
        </Button>
      }
    >
      {invites.isLoading ? (
        <div className="p-4">
          <Skeleton className="h-10" />
        </div>
      ) : !invites.data?.length ? (
        <p className="px-4 py-5 text-small text-muted">Bekleyen davet yok. Davet linki 7 gün geçerlidir ve tek kişi tarafından kullanılabilir.</p>
      ) : (
        <ul className="divide-y divide-line">
          {invites.data.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="flex size-8 items-center justify-center rounded-full bg-subtle text-muted">
                <Link2 className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium">
                  {ROLE_LABELS[i.role]}
                  {i.note && <span className="font-normal text-muted"> · {i.note}</span>}
                </p>
                <p className="truncate text-caption text-muted">
                  {i.createdBy.name} oluşturdu · {fmtLong(i.expiresAt)} tarihine kadar geçerli
                </p>
              </div>
              <IconButton icon={Trash2} size="sm" label="Daveti iptal et" onClick={() => revoke(i.id)} />
            </li>
          ))}
        </ul>
      )}
      <CreateInviteModal open={creating} onClose={() => setCreating(false)} />
    </Card>
  );
}

function CreateInviteModal({ open, onClose }: { open: boolean; onClose(): void }) {
  const qc = useQueryClient();
  const [role, setRole] = useState<Exclude<Role, 'OWNER'>>('EDITOR');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedInviteDto | null>(null);
  const [copied, setCopied] = useState(false);
  const link = created ? `${window.location.origin}/invite/${created.token}` : '';

  const close = () => {
    setCreated(null);
    setNote('');
    setRole('EDITOR');
    setError(null);
    setCopied(false);
    onClose();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setCreated(await api<CreatedInviteDto>(ws('/invites'), { body: { role, note: note.trim() || undefined } }));
      qc.invalidateQueries({ queryKey: ['invites'] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* pano erişimi yoksa kullanıcı elle seçer */
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={created ? 'Davet linki hazır' : 'Davet oluştur'}
      size="sm"
      footer={
        created ? (
          <Button variant="primary" onClick={close}>
            Tamam
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              Vazgeç
            </Button>
            <Button variant="primary" type="submit" form="invite-form" loading={busy}>
              Link oluştur
            </Button>
          </>
        )
      }
    >
      {created ? (
        <div className="space-y-3">
          <p className="text-small text-muted">
            Bu linki davet ettiğiniz kişiye iletin (e-posta, WhatsApp vb.). <strong className="font-semibold text-ink-2">Link yalnızca şimdi gösterilir</strong>
            ; 7 gün geçerlidir ve tek kişi kullanabilir.
          </p>
          <div className="flex items-center gap-1.5 rounded-control border border-line bg-canvas py-1 pr-1 pl-2.5">
            <code className="min-w-0 flex-1 truncate text-caption text-ink-2" title={link}>
              {link}
            </code>
            <Button size="sm" variant="ghost" icon={copied ? Check : Copy} onClick={copy}>
              {copied ? 'Kopyalandı' : 'Kopyala'}
            </Button>
          </div>
        </div>
      ) : (
        <form id="invite-form" onSubmit={submit} className="space-y-4">
          {error && <Notice tone="error">{error}</Notice>}
          <Field label="Rol" htmlFor="invite-role" hint={ROLE_HELP[role]}>
            <Select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as Exclude<Role, 'OWNER'>)}>
              {ASSIGNABLE.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kimin için (isteğe bağlı)" htmlFor="invite-note" hint="Yalnızca bekleyen davetler listesinde hatırlatma olarak görünür.">
            <Input id="invite-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="ör. Ayşe – içerik" />
          </Field>
        </form>
      )}
    </Modal>
  );
}
