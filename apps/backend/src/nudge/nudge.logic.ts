/**
 * When a declared window is open, in the member's own time.
 *
 * Pure, and in a `.logic.ts` file, so the scheduler's arithmetic can be
 * tested without a database, a clock or a decorator — the type-stripping
 * runner cannot load a file with `@Injectable()` in it.
 */

export interface DeclaredWindow {
  /** 0 = Sunday, matching Date#getDay. */
  readonly weekday: number;
  readonly startMinute: number;
  readonly endMinute: number;
}

export interface LocalNow {
  readonly weekday: number;
  readonly minuteOfDay: number;
}

/**
 * The member's local weekday and minute-of-day.
 *
 * The scheduler runs in UTC and has to decide whether it is eleven in the
 * morning where somebody actually is. `utcOffsetMinutes` is what the
 * browser reported at subscribe time — positive east of Greenwich, which
 * is the opposite sign from `Date#getTimezoneOffset`, and the conversion
 * is done once here rather than at each call site so the sign can only be
 * wrong in one place.
 */
export function localNow(now: Date, utcOffsetMinutes: number): LocalNow {
  const shifted = new Date(now.getTime() + utcOffsetMinutes * 60_000);
  return {
    weekday: shifted.getUTCDay(),
    minuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/**
 * The window this moment falls inside, or null.
 *
 * Half-open — start inclusive, end exclusive — so two windows that abut
 * at 12:00 cannot both claim noon and produce two prompts a minute apart.
 */
export function openWindow(
  windows: readonly DeclaredWindow[],
  at: LocalNow,
): DeclaredWindow | null {
  return (
    windows.find(
      (w) =>
        w.weekday === at.weekday &&
        at.minuteOfDay >= w.startMinute &&
        at.minuteOfDay < w.endMinute,
    ) ?? null
  );
}

/**
 * How long is left of the window, in seconds, capped at the request.
 *
 * The engine is asked for something that fits the time that is genuinely
 * free, and at 11:58 in a window that ends at 12:00 that is two minutes,
 * not the twenty the member declared. Asking for more than remains is how
 * a prompt arrives that cannot be finished, which is the failure mode the
 * whole product is built against.
 */
export function secondsLeftIn(window: DeclaredWindow, at: LocalNow): number {
  return Math.max(0, (window.endMinute - at.minuteOfDay) * 60);
}
