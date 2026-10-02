// "21:14" <-> 9:14 PM, for the time picker. Values everywhere else stay "HH:mm".

export interface Clock12 {
  /** 1 to 12 */
  hour: number;
  /** 0 to 59 */
  minute: number;
  pm: boolean;
}

/** Reads "HH:mm" (24-hour). Returns null for anything else. */
export function to12h(value: string): Clock12 | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec((value ?? '').trim());
  if (!match) return null;
  const h24 = Number(match[1]);
  return { hour: h24 % 12 === 0 ? 12 : h24 % 12, minute: Number(match[2]), pm: h24 >= 12 };
}

/** 12 AM is 00:00 and 12 PM is 12:00. */
export function from12h(c: Clock12): string {
  const h24 = (c.hour % 12) + (c.pm ? 12 : 0);
  return `${String(h24).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`;
}

/** "9:14 PM". Empty text when the value is not a time. */
export function formatTime12(value: string): string {
  const c = to12h(value);
  if (!c) return '';
  return `${c.hour}:${String(c.minute).padStart(2, '0')} ${c.pm ? 'PM' : 'AM'}`;
}

/** The minutes to offer: every `step`, plus the current one if it falls between. */
export function minuteOptions(step: number, current: number): number[] {
  const safeStep = Math.min(Math.max(Math.floor(step) || 5, 1), 30);
  const list: number[] = [];
  for (let m = 0; m < 60; m += safeStep) list.push(m);
  if (!list.includes(current)) list.push(current);
  return list.sort((a, b) => a - b);
}
