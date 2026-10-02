'use client';

// A time picker in the app's own style, replacing the browser's plain clock.
// Tap the field, pick hour, minute and AM/PM, then "Set time". The value it
// gives back is still "HH:mm" (24-hour), so nothing else needs to change.

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ClockIcon } from '@/components/ui/icons';
import { formatTime12, from12h, minuteOptions, to12h, type Clock12 } from '@/lib/time-format';

interface TimeFieldProps {
  label: string;
  /** "HH:mm", or empty when nothing is chosen yet. */
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  /** Shown under the field in red, like the other fields. */
  error?: string;
  /** Minutes offered in the list. Default 5. */
  minuteStep?: number;
  disabled?: boolean;
}

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const DEFAULT_TIME: Clock12 = { hour: 9, minute: 0, pm: false };

function nowRounded(step: number): Clock12 {
  const d = new Date();
  const total = Math.round((d.getHours() * 60 + d.getMinutes()) / step) * step;
  const minutes = total % 1440;
  const h24 = Math.floor(minutes / 60);
  return { hour: h24 % 12 === 0 ? 12 : h24 % 12, minute: minutes % 60, pm: h24 >= 12 };
}

function Column({
  label,
  items,
  selected,
  render,
  onPick,
}: {
  label: string;
  items: number[];
  selected: number;
  render: (n: number) => string;
  onPick: (n: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Bring the chosen item to the middle of the column.
  useEffect(() => {
    const box = ref.current;
    const el = box?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (box && el) box.scrollTop = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
  }, [selected]);

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={label}
      className="relative h-52 flex-1 overflow-y-auto rounded-2xl border border-ink-100 bg-white/[0.03] p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {items.map((n) => {
        const active = n === selected;
        return (
          <button
            key={n}
            type="button"
            role="option"
            aria-selected={active}
            onClick={() => onPick(n)}
            className={`mb-1 flex h-11 w-full items-center justify-center rounded-xl text-lg tabular-nums transition-colors duration-150 ease-premium ${
              active
                ? 'bg-gradient-to-b from-brass to-[#3B82F6] font-semibold text-white shadow-floating'
                : 'text-ink-400 hover:bg-white/[0.06] hover:text-ink'
            }`}
          >
            {render(n)}
          </button>
        );
      })}
    </div>
  );
}

export function TimeField({ label, value, onChange, hint, error, minuteStep = 5, disabled }: TimeFieldProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Clock12>(DEFAULT_TIME);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function openPicker() {
    setDraft(to12h(value) ?? DEFAULT_TIME);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function confirm() {
    onChange(from12h(draft));
    close();
  }

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const shown = formatTime12(value);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-ink-400">
        {label}
      </label>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={Boolean(error)}
        onClick={openPicker}
        className={`flex w-full items-center justify-between gap-3 rounded-2xl border bg-white/[0.03] px-4 py-3.5 text-left text-[15px] font-medium backdrop-blur-glass transition-colors hover:bg-white/[0.06] focus:border-brass/60 focus:outline-none focus:ring-2 focus:ring-brass/40 disabled:opacity-50 ${
          error ? 'border-alert' : 'border-ink-100'
        }`}
      >
        <span className={shown ? 'text-ink' : 'text-ink-400'}>{shown || 'Select time'}</span>
        <ClockIcon className="h-[18px] w-[18px] text-brass" />
      </button>
      {error ? (
        <p className="text-sm text-alert">{error}</p>
      ) : hint ? (
        <p className="text-sm text-ink-400">{hint}</p>
      ) : null}

      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
            <button
              type="button"
              aria-label="Close time picker"
              onClick={close}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              tabIndex={-1}
            />
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label={label}
              tabIndex={-1}
              className="dropdown-panel animate-fade-up relative flex w-full max-w-sm flex-col gap-5 rounded-t-[32px] px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 shadow-card outline-none sm:rounded-[32px] sm:pb-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] font-medium text-ink-400">{label}</p>
                  <p className="mt-1 font-display text-4xl font-bold tabular-nums text-ink">
                    {draft.hour}
                    <span className="text-brass">:</span>
                    {String(draft.minute).padStart(2, '0')}
                    <span className="ml-2 text-xl font-semibold text-brass">{draft.pm ? 'PM' : 'AM'}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDraft(nowRounded(Math.min(Math.max(minuteStep, 1), 30)))}
                  className="rounded-pill border border-ink-100 px-3.5 py-1.5 text-xs font-medium text-brass transition-colors duration-150 ease-premium hover:bg-white/[0.06]"
                >
                  Now
                </button>
              </div>

              <div className="flex gap-3">
                <Column
                  label="Hour"
                  items={HOURS}
                  selected={draft.hour}
                  render={(n) => String(n)}
                  onPick={(hour) => setDraft((d) => ({ ...d, hour }))}
                />
                <Column
                  label="Minute"
                  items={minuteOptions(minuteStep, draft.minute)}
                  selected={draft.minute}
                  render={(n) => String(n).padStart(2, '0')}
                  onPick={(minute) => setDraft((d) => ({ ...d, minute }))}
                />
                <div role="radiogroup" aria-label="AM or PM" className="flex w-20 flex-col gap-2">
                  {[
                    { label: 'AM', pm: false },
                    { label: 'PM', pm: true },
                  ].map((o) => (
                    <button
                      key={o.label}
                      type="button"
                      role="radio"
                      aria-checked={draft.pm === o.pm}
                      onClick={() => setDraft((d) => ({ ...d, pm: o.pm }))}
                      className={`flex flex-1 items-center justify-center rounded-2xl border text-base font-semibold transition-colors duration-150 ease-premium ${
                        draft.pm === o.pm
                          ? 'border-transparent bg-gradient-to-b from-brass to-[#3B82F6] text-white shadow-floating'
                          : 'border-ink-100 bg-white/[0.03] text-ink-400 hover:text-ink'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={close}
                  className="h-[52px] flex-1 rounded-2xl border border-ink-100 text-base font-medium text-ink-400 transition-colors duration-150 ease-premium hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirm}
                  className="h-[52px] flex-1 rounded-2xl bg-gradient-to-b from-brass to-[#3B82F6] text-base font-semibold text-white shadow-floating transition-transform duration-150 ease-premium active:scale-[0.98]"
                >
                  Set time
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
