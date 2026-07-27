import type { VerificationMethod } from './snaps';

/**
 * §7.2 — The Four Delivery Tiers. Nobody is excluded by hardware.
 * T3 and T4 are first-class product tiers with their own conversion
 * funnels, not charity. In the diaspora expansion track, T3 is primary.
 */
export const DELIVERY_TIERS = ['T1', 'T2', 'T3', 'T4'] as const;
export type DeliveryTier = (typeof DELIVERY_TIERS)[number];

export interface DeliveryTierDefinition {
  tier: DeliveryTier;
  name: string;
  dataAvailable: string;
  channels: readonly string[];
  verification: readonly VerificationMethod[];
}

export const DELIVERY_TIER_DEFINITIONS: Readonly<
  Record<DeliveryTier, DeliveryTierDefinition>
> = {
  T1: {
    tier: 'T1',
    name: 'Fused',
    dataAvailable: 'Wearable + phone + calendar',
    channels: ['app_push', 'watch_haptic'],
    verification: ['wearable_delta', 'motion_signature'],
  },
  T2: {
    tier: 'T2',
    name: 'Phone-only',
    dataAvailable: 'Phone motion, calendar',
    channels: ['app_push'],
    verification: ['motion_signature'],
  },
  T3: {
    tier: 'T3',
    name: 'Lightweight',
    dataAvailable: 'Self-reported schedule only',
    channels: ['whatsapp', 'sms'],
    verification: ['reply_confirm', 'voice_note'],
  },
  T4: {
    tier: 'T4',
    name: 'Assisted',
    dataAvailable: 'Carer / coordinator input',
    channels: ['large_format_tablet', 'tv_cast', 'smart_speaker', 'ivr'],
    verification: ['proxy_attestation'],
  },
};

/** Reply keywords accepted on T3. Case-insensitive, tolerant of variants. */
export const T3_KEYWORDS = {
  done: ['done', 'd', 'yes', 'y', 'complete', 'finished'],
  skip: ['skip', 's', 'no', 'n', 'pass'],
  later: ['later', 'l', 'snooze'],
  stop: ['stop', 'unsubscribe', 'end', 'quit', 'cancel'],
} as const;

export type T3Intent = keyof typeof T3_KEYWORDS;

export function parseT3Reply(raw: string): T3Intent | null {
  const normalised = raw.trim().toLowerCase().replace(/[^a-z]/g, '');
  for (const [intent, words] of Object.entries(T3_KEYWORDS) as [
    T3Intent,
    readonly string[],
  ][]) {
    if (words.includes(normalised)) return intent;
  }
  return null;
}
