import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  nextMonday,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { tr } from 'date-fns/locale';
import { CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { fmtShort } from '../lib/format';
import { Button, cx, IconButton, Input, Popover } from './ui';

const at = (d: Date, h: number, m = 0) => {
  const x = new Date(d);
  x.setHours(h, m, 0, 0);
  return x;
};

/** Yayın zamanı seçici: hızlı seçenekler, mini takvim, saat (DESIGN.md §5.3). */
export function DateTimePicker({ value, onChange }: { value: Date; onChange(d: Date): void }) {
  const past = value < new Date();
  return (
    <Popover
      side="top"
      align="end"
      className="w-[300px] p-0"
      trigger={({ toggle }) => (
        <Button icon={CalendarClock} onClick={toggle} className={cx('tabular-nums', past && 'border-failed text-failed-fg')}>
          {fmtShort(value)}
        </Button>
      )}
    >
      {(close) => <Panel value={value} onChange={onChange} close={close} />}
    </Popover>
  );
}

function Panel({ value, onChange, close }: { value: Date; onChange(d: Date): void; close(): void }) {
  const [month, setMonth] = useState(startOfMonth(value));
  const [draft, setDraft] = useState(value);
  const now = new Date();
  const inHour = new Date(now);
  inHour.setHours(now.getHours() + 1, 0, 0, 0);
  const quick = [
    { label: '1 saat sonra', d: inHour },
    { label: 'Yarın 09:00', d: at(addDays(now, 1), 9) },
    { label: 'Pazartesi 09:00', d: at(nextMonday(now), 9) },
  ];
  const days: Date[] = [];
  for (let d = startOfWeek(month, { weekStartsOn: 1 }); d <= endOfWeek(endOfMonth(month), { weekStartsOn: 1 }); d = addDays(d, 1)) days.push(d);

  const pickDay = (d: Date) => {
    setDraft(at(d, draft.getHours(), draft.getMinutes()));
  };
  const pickTime = (v: string) => {
    const [h, m] = v.split(':').map(Number);
    if (!Number.isNaN(h) && !Number.isNaN(m)) setDraft(at(draft, h, m));
  };
  const done = (d = draft) => {
    onChange(d);
    close();
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 border-b border-line p-3">
        {quick.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => done(q.d)}
            className="rounded-full border border-line-strong px-2.5 py-1 text-caption font-medium text-ink-2 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
          >
            {q.label}
          </button>
        ))}
      </div>
      <div className="p-3">
        <div className="mb-2 flex items-center">
          <span className="flex-1 pl-1 text-small font-semibold">{format(month, 'LLLL yyyy', { locale: tr }).replace(/^./, (c) => c.toLocaleUpperCase('tr'))}</span>
          <IconButton icon={ChevronLeft} size="sm" label="Önceki ay" disabled={isSameMonth(month, now)} onClick={() => setMonth(addMonths(month, -1))} />
          <IconButton icon={ChevronRight} size="sm" label="Sonraki ay" onClick={() => setMonth(addMonths(month, 1))} />
        </div>
        <div className="grid grid-cols-7 text-center">
          {['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa'].map((d) => (
            <span key={d} className="pb-1 text-micro font-medium text-faint">
              {d}
            </span>
          ))}
          {days.map((d) => {
            const disabled = startOfDay(d) < startOfDay(now);
            const on = isSameDay(d, draft);
            return (
              <button
                key={d.toISOString()}
                type="button"
                disabled={disabled}
                onClick={() => pickDay(d)}
                className={cx(
                  'mx-auto flex size-8 items-center justify-center rounded-control text-small tabular-nums transition-colors',
                  on ? 'bg-brand-600 font-semibold text-white' : 'hover:bg-subtle',
                  !on && isToday(d) && 'font-semibold text-brand-700',
                  !on && !isSameMonth(d, month) && 'text-faint',
                  disabled && 'cursor-not-allowed text-line-strong hover:bg-transparent',
                )}
              >
                {format(d, 'd')}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Input type="time" aria-label="Saat" value={format(draft, 'HH:mm')} onChange={(e) => pickTime(e.target.value)} className="tabular-nums" />
          <Button variant="primary" onClick={() => done()}>
            Tamam
          </Button>
        </div>
        {draft < now && <p className="mt-2 text-caption text-failed-fg">Seçilen zaman geçmişte kaldı.</p>}
      </div>
    </div>
  );
}
