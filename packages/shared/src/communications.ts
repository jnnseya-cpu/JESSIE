/**
 * Communication Event Architecture.
 *
 * One catalogue. Every message the platform can send is an event with a
 * key, a severity, a default channel set and a set of flags that decide
 * what happens to it at delivery time. Nothing sends a message by
 * constructing a string somewhere in a service.
 *
 * The part that makes this specific to JESS MOVE rather than generic
 * notification plumbing is the resolver at the bottom. A platform serving
 * ten-year-olds and ninety-year-olds from one engine cannot have a single
 * "send to user" path, so `resolveDelivery` applies, in order:
 *
 *   1. Age. `adultOnly` events do not exist below 18 — not suppressed,
 *      not consent-gated, not deliverable.
 *   2. Coach presence. If MOVA is off, coaching events do not send. Off
 *      means off, consistent with `mayDeliver` in mova.ts.
 *   3. Context. Law 2 — a coaching nudge into a moment the person cannot
 *      move is a defect, so a held context blocks it.
 *   4. Quiet hours and the daily cap, which coaching obeys and statutory
 *      notices do not.
 *   5. Channel consent, which `mandatory` events bypass.
 *
 * `mandatory` bypasses *preferences*. It never bypasses age.
 */

/* ------------------------------------------------------------------ *
 * Channels
 * ------------------------------------------------------------------ */

export const MESSAGE_CHANNELS = ['email', 'in_app', 'sms', 'push', 'whatsapp'] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export interface ChannelDefinition {
  readonly channel: MessageChannel;
  readonly label: string;
  /** False when no provider is configured for it yet. */
  readonly wired: boolean;
  readonly provider: string;
  /** Cost per message in GBP. Feeds the messaging line of the cost model. */
  readonly unitCostGbp: number;
  readonly note: string;
}

export const CHANNEL_DEFINITIONS: Readonly<Record<MessageChannel, ChannelDefinition>> = {
  email: {
    channel: 'email',
    label: 'Email',
    wired: true,
    provider: 'transactional ESP',
    unitCostGbp: 0.0004,
    note: 'Branded template, company logo and details on every outbound message.',
  },
  in_app: {
    channel: 'in_app',
    label: 'In-app',
    wired: true,
    provider: 'platform',
    unitCostGbp: 0,
    note: 'Every catalogue event lands here. It is the record of what happened.',
  },
  sms: {
    channel: 'sms',
    label: 'SMS',
    wired: true,
    provider: 'SMS gateway',
    unitCostGbp: 0.032,
    note: 'Reserved for critical and mandatory notices. The most expensive channel by two orders of magnitude.',
  },
  push: {
    channel: 'push',
    label: 'Push',
    wired: true,
    provider: 'device push service',
    unitCostGbp: 0.00002,
    note: 'Coaching and time-sensitive events. Obeys quiet hours and the daily cap.',
  },
  whatsapp: {
    channel: 'whatsapp',
    label: 'WhatsApp',
    wired: false,
    provider: 'not configured',
    unitCostGbp: 0.0045,
    note: 'Catalogued and templated, but no provider is connected. Events naming it fall back to the next channel.',
  },
};

export const WIRED_CHANNELS = MESSAGE_CHANNELS.filter((c) => CHANNEL_DEFINITIONS[c].wired);

/* ------------------------------------------------------------------ *
 * Severity and categories
 * ------------------------------------------------------------------ */

export const EVENT_SEVERITIES = ['info', 'success', 'warning', 'critical'] as const;
export type EventSeverity = (typeof EVENT_SEVERITIES)[number];

export const EVENT_CATEGORIES = [
  'Identity & Account',
  'Login & Security',
  'Guardianship & Household',
  'Subscription & Billing',
  'ACU Wallet & Spend',
  'Movement & Coaching',
  'Safety & Clinical',
  'FoodLens & Nutrition',
  'BodyCommand',
  'Challenges & Crews',
  'Wearables & Devices',
  'Progress & Insight',
  'Organisation & Workplace',
  'Growth & Partners',
  'Support, Platform & Privacy',
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

/* ------------------------------------------------------------------ *
 * The event shape
 * ------------------------------------------------------------------ */

export interface CommEventFlags {
  /** Bypasses channel preferences and marketing opt-out. Never bypasses age. */
  readonly mandatory?: true;
  /** Does not exist below 18. Not suppressed — absent. */
  readonly adultOnly?: true;
  /** The linked guardian receives a copy when the subject is a minor. */
  readonly guardianCopy?: true;
  /** May deliver inside quiet hours. */
  readonly quietHoursExempt?: true;
  /** Subject to MOVA presence, the daily cap and Law 2 context holds. */
  readonly coaching?: true;
}

export interface CommEvent extends CommEventFlags {
  readonly key: string;
  readonly name: string;
  /** The subject line or notification title. `{{token}}` is interpolated at render. */
  readonly subject: string;
  readonly category: EventCategory;
  readonly severity: EventSeverity;
  readonly channels: readonly MessageChannel[];
}

/** Compact constructor — the catalogue is data and reads better as rows. */
function E(
  key: string,
  name: string,
  subject: string,
  severity: EventSeverity,
  channels: readonly MessageChannel[],
  flags: CommEventFlags = {},
): Omit<CommEvent, 'category'> {
  return { key, name, subject, severity, channels, ...flags };
}

const I: readonly MessageChannel[] = ['in_app'];
const EI: readonly MessageChannel[] = ['email', 'in_app'];
const EIS: readonly MessageChannel[] = ['email', 'in_app', 'sms'];
const EIP: readonly MessageChannel[] = ['email', 'in_app', 'push'];
const IP: readonly MessageChannel[] = ['in_app', 'push'];
const EISP: readonly MessageChannel[] = ['email', 'in_app', 'sms', 'push'];

/* ------------------------------------------------------------------ *
 * The catalogue
 * ------------------------------------------------------------------ */

const CATALOGUE_BY_CATEGORY: Readonly<
  Record<EventCategory, readonly Omit<CommEvent, 'category'>[]>
> = {
  'Identity & Account': [
    E('account.registration.requested', 'Account requested', 'Welcome to JESS MOVE — confirm your account', 'info', EI),
    E('account.registration.received', 'Registration received', 'We received your registration', 'info', EI),
    E('account.email_verification_required', 'Email verification required', 'Verify your email address', 'warning', EI, { mandatory: true }),
    E('account.mobile_verification_required', 'Mobile verification required', 'Verify your mobile number', 'warning', EIS),
    E('account.age_verification_required', 'Age verification required', 'We need to confirm your age band', 'warning', EI, { mandatory: true }),
    E('account.age_band_assigned', 'Age band assigned', 'Your JESS MOVE mode is set to {{mode}}', 'success', EI),
    E('account.age_band_changed', 'Age band changed', 'Your mode has changed to {{mode}}', 'info', EI, { mandatory: true, guardianCopy: true }),
    E('account.verification.successful', 'Verification successful', 'Your account is verified', 'success', EI),
    E('account.verification.failed', 'Verification failed', 'Verification could not be completed', 'warning', EI),
    E('account.verification.expired', 'Verification expired', 'Your verification link expired', 'warning', EI),
    E('account.registration.abandoned', 'Registration abandoned', 'Finish setting up your JESS MOVE account', 'info', EI),
    E('account.onboarding.started', 'Onboarding started', 'Let’s learn how your day works', 'info', EI),
    E('account.onboarding.step_completed', 'Onboarding step completed', 'Step {{item}} complete', 'success', I),
    E('account.onboarding.completed', 'Onboarding completed', 'Your Movement Vector is ready', 'success', EI),
    E('account.onboarding.abandoned', 'Onboarding abandoned', 'Two questions left, then you’re set', 'info', EI),
    E('account.profile_updated', 'Profile updated', 'Your profile was updated', 'info', I),
    E('account.capability_profile_updated', 'Capability profile updated', 'Your movement options have changed', 'info', EI),
    E('account.mode_override_requested', 'Mode override requested', 'A mode change was requested on your account', 'warning', EI, { mandatory: true }),
    E('account.closed', 'Account closed', 'Your JESS MOVE account is closed', 'info', EI, { mandatory: true }),
    E('account.reopened', 'Account reopened', 'Welcome back', 'success', EI),
  ],

  'Login & Security': [
    E('auth.login.success', 'Successful login', 'New sign-in to your account', 'info', I),
    E('auth.login.failed', 'Failed login', 'Failed sign-in attempt', 'warning', I),
    E('auth.login.suspicious', 'Suspicious login', 'Unusual sign-in detected', 'critical', EIS, { mandatory: true, quietHoursExempt: true }),
    E('auth.device.new', 'New device detected', 'New device signed in', 'warning', EI, { mandatory: true }),
    E('auth.device.approved', 'Device approved', 'Device approved', 'success', I),
    E('auth.device.rejected', 'Device rejected', 'Device rejected', 'warning', EI),
    E('password.forgot', 'Forgot password', 'Reset your JESS MOVE password', 'info', EI),
    E('password.reset_link', 'Password reset link', 'Your password reset link', 'info', EI),
    E('password.reset.successful', 'Password reset successful', 'Your password was reset', 'success', EIS, { mandatory: true }),
    E('password.changed', 'Password changed', 'Your password was changed', 'success', EI, { mandatory: true }),
    E('password.expiry_warning', 'Password expiry warning', 'Your password expires soon', 'warning', EI),
    E('mfa.otp_code', 'OTP code', 'Your JESS MOVE verification code', 'info', EIS, { quietHoursExempt: true }),
    E('mfa.enabled', 'MFA enabled', 'Two-factor authentication enabled', 'success', EI, { mandatory: true }),
    E('mfa.disabled', 'MFA disabled', 'Two-factor authentication disabled', 'warning', EIS, { mandatory: true }),
    E('mfa.backup_code_generated', 'Backup codes generated', 'New backup codes generated', 'info', EI),
    E('security.alert', 'Security alert', 'Security alert on your account', 'critical', EIS, { mandatory: true, quietHoursExempt: true }),
    E('account.locked', 'Account locked', 'Your account has been locked', 'critical', EIS, { mandatory: true, quietHoursExempt: true }),
    E('account.unlocked', 'Account unlocked', 'Your account is unlocked', 'success', EI),
    E('security.too_many_attempts', 'Too many attempts', 'Too many attempts', 'warning', I),
    E('session.revoked', 'Session revoked', 'A session was signed out', 'warning', EI, { mandatory: true }),
  ],

  'Guardianship & Household': [
    E('guardian.link_requested', 'Guardian link requested', '{{name}} has asked you to be their guardian on JESS MOVE', 'info', EI, { mandatory: true }),
    E('guardian.link_confirmed', 'Guardian link confirmed', 'You are now the guardian for {{name}}', 'success', EI, { mandatory: true }),
    E('guardian.link_declined', 'Guardian link declined', 'A guardian request was declined', 'info', EI),
    E('guardian.link_removed', 'Guardian link removed', 'A guardian link was removed', 'warning', EI, { mandatory: true }),
    E('guardian.consent_requested', 'Guardian consent requested', 'Consent needed for {{item}}', 'warning', EI, { mandatory: true }),
    E('guardian.consent_granted', 'Guardian consent granted', 'Consent recorded for {{item}}', 'success', EI),
    E('guardian.consent_withdrawn', 'Guardian consent withdrawn', 'Consent withdrawn for {{item}}', 'warning', EI, { mandatory: true }),
    E('guardian.weekly_summary', 'Guardian weekly summary', 'This week for {{name}}', 'info', [...EI, 'whatsapp']),
    E('guardian.safeguarding_notice', 'Safeguarding notice to guardian', 'Something we think you should know', 'critical', EIS, { mandatory: true, quietHoursExempt: true }),
    E('household.member_added', 'Household member added', '{{name}} joined your household', 'info', EI),
    E('household.member_removed', 'Household member removed', '{{name}} left your household', 'info', EI),
    E('household.seat_limit_reached', 'Household seat limit reached', 'Your household plan is full', 'warning', EI),
    E('household.owner_changed', 'Household owner changed', 'Household ownership changed', 'warning', EI, { mandatory: true }),
    E('minor.turns_18', 'Member reaches 18', 'Your account moves to adult mode next week', 'info', EI, { mandatory: true }),
    E('minor.guardian_visibility_reminder', 'Guardian visibility reminder', 'What your guardian can and cannot see', 'info', EI, { mandatory: true }),
  ],

  'Subscription & Billing': [
    E('subscription.trial_started', 'Trial started', 'Your JESS MOVE trial has started', 'success', EI, { adultOnly: true }),
    E('subscription.trial_ending', 'Trial ending', 'Your trial ends in 3 days', 'warning', EI, { adultOnly: true }),
    E('subscription.trial_expired', 'Trial expired', 'Your trial has ended', 'warning', EI, { adultOnly: true }),
    E('subscription.activated', 'Subscription activated', 'Your {{plan}} subscription is active', 'success', EI, { adultOnly: true }),
    E('subscription.renewed', 'Subscription renewed', 'Your subscription renewed', 'info', EI, { adultOnly: true }),
    E('subscription.upgraded', 'Subscription upgraded', 'You moved to {{plan}}', 'success', EI, { adultOnly: true }),
    E('subscription.downgraded', 'Subscription downgraded', 'Your plan changes on {{date}}', 'info', EI, { adultOnly: true }),
    E('subscription.cancelled', 'Subscription cancelled', 'Your subscription was cancelled', 'warning', EI, { adultOnly: true, mandatory: true }),
    E('subscription.reactivated', 'Subscription reactivated', 'Your subscription is reactivated', 'success', EI, { adultOnly: true }),
    E('payment.pending', 'Payment pending', 'Payment is processing', 'info', I, { adultOnly: true }),
    E('payment.successful', 'Payment successful', 'Payment received — {{amount}}', 'success', EI, { adultOnly: true }),
    E('payment.failed', 'Payment failed', 'Your payment failed', 'warning', EIS, { adultOnly: true, mandatory: true }),
    E('payment.retry', 'Payment retry', 'We’ll retry your payment', 'info', EI, { adultOnly: true }),
    E('payment.below_minimum', 'Charge below the £5 floor', 'That amount is below our £5 minimum', 'info', EI, { adultOnly: true }),
    E('payment.card_expiring', 'Card expiring', 'Your card expires soon', 'warning', EI, { adultOnly: true }),
    E('payment.card_expired', 'Card expired', 'Your card has expired', 'warning', EI, { adultOnly: true, mandatory: true }),
    E('payment.refund_processed', 'Refund processed', 'Your refund was processed', 'success', EI, { adultOnly: true }),
    E('payment.chargeback_received', 'Chargeback received', 'A chargeback was raised on your account', 'critical', EI, { adultOnly: true, mandatory: true }),
    E('invoice.generated', 'Invoice generated', 'Invoice {{number}} is ready', 'info', EI, { adultOnly: true }),
    E('invoice.overdue', 'Invoice overdue', 'Invoice {{number}} is overdue', 'warning', EIS, { adultOnly: true, mandatory: true }),
    E('invoice.reminder', 'Invoice reminder', 'Reminder: invoice {{number}} due {{date}}', 'info', EI, { adultOnly: true }),
    E('invoice.paid', 'Invoice paid', 'Invoice {{number}} paid', 'success', EI, { adultOnly: true }),
    E('invoice.credit_note_issued', 'Credit note issued', 'Credit note issued', 'info', EI, { adultOnly: true }),
  ],

  'ACU Wallet & Spend': [
    E('acu.wallet_created', 'Wallet created', 'Your Adaptive Coaching Unit wallet is open', 'info', I, { adultOnly: true }),
    E('acu.allowance_granted', 'Monthly allowance granted', 'Your {{plan}} allowance is available', 'success', I, { adultOnly: true }),
    E('acu.quote_issued', 'Quote issued before an expensive action', 'This action will cost {{amount}}', 'info', I, { adultOnly: true }),
    E('acu.balance_low', 'Balance low', 'Your ACU balance is running low', 'warning', EI, { adultOnly: true }),
    E('acu.balance_exhausted', 'Balance exhausted', 'Paid AI actions are paused', 'warning', EI, { adultOnly: true, mandatory: true }),
    E('acu.topup_successful', 'Top-up successful', 'Top-up received — {{amount}}', 'success', EI, { adultOnly: true }),
    E('acu.topup_failed', 'Top-up failed', 'Your top-up did not complete', 'warning', EI, { adultOnly: true, mandatory: true }),
    E('acu.auto_topup_enabled', 'Auto top-up enabled', 'Auto top-up is on', 'info', EI, { adultOnly: true }),
    E('acu.auto_topup_triggered', 'Auto top-up triggered', 'We topped up your wallet automatically', 'info', EI, { adultOnly: true }),
    E('acu.auto_topup_raised_to_minimum', 'Auto top-up raised to the minimum', 'Your top-up was raised to £5, our minimum charge', 'info', EI, { adultOnly: true }),
    E('acu.spend_cap_reached', 'Spend cap reached', 'You have reached your monthly spend cap', 'warning', EI, { adultOnly: true, mandatory: true }),
    E('acu.rollover_applied', 'Rollover applied', 'Unused units rolled over', 'success', I, { adultOnly: true }),
    E('acu.rollover_expiring', 'Rollover expiring', 'Rolled-over units expire on {{date}}', 'info', EI, { adultOnly: true }),
    E('acu.hard_stop', 'Hard stop reached', 'Paid AI actions have stopped. Nothing else has.', 'warning', EI, { adultOnly: true, mandatory: true }),
  ],

  'Movement & Coaching': [
    E('snap.offered', 'Movement offered', '{{item}} — {{duration}}', 'info', IP, { coaching: true }),
    E('snap.reminder', 'Movement reminder', 'Still a good moment for {{item}}', 'info', IP, { coaching: true }),
    E('snap.started', 'Movement started', 'Started', 'info', I),
    E('snap.completed', 'Movement completed', 'Nice one — {{item}} done', 'success', I),
    E('snap.skipped', 'Movement skipped', 'Skipped, noted', 'info', I),
    E('snap.held_context', 'Held — you cannot move right now', 'Held: {{item}}', 'info', I),
    E('snap.held_quiet_hours', 'Held — quiet hours', 'Held until morning', 'info', I),
    E('snap.held_daily_cap', 'Held — daily cap reached', 'That’s enough from us today', 'info', I),
    E('snap.variant_substituted', 'Variant substituted downward', 'Switched to the supported version', 'info', I, { coaching: true }),
    E('snap.dose_reduced', 'Dose reduced', 'We made this one shorter', 'info', I, { coaching: true }),
    E('mova.window_opening', 'Movement window opening', 'Your strongest window starts in {{item}}', 'info', IP, { coaching: true }),
    E('mova.daily_plan_ready', 'Daily plan ready', 'Today’s plan is ready', 'info', IP, { coaching: true }),
    E('mova.presence_changed', 'Coach presence changed', 'MOVA is now set to {{item}}', 'info', I),
    E('mova.explained_suggestion', 'Suggestion explained', 'Why we suggested {{item}}', 'info', I),
    E('mova.refused_request', 'Coach declined a request', 'That is not something I can do', 'info', I),
    E('habit.anchor_suggested', 'Habit anchor suggested', 'This fits right after {{item}}', 'info', IP, { coaching: true }),
    E('habit.chain_extended', 'Chain extended', 'Day {{item}}', 'success', I),
    E('habit.grace_token_spent', 'Grace token spent automatically', 'Your chain held', 'success', I),
    E('habit.flare_mode_on', 'Flare mode enabled', 'Targets lowered, chain intact', 'info', EI),
    E('habit.flare_mode_off', 'Flare mode ended', 'Back to your usual targets', 'info', I),
    E('habit.bereavement_hold_on', 'Bereavement hold started', 'Everything is paused. Nothing is lost.', 'info', EI, { mandatory: true }),
    E('habit.bereavement_hold_off', 'Bereavement hold ended', 'Welcome back, at your pace', 'info', EI),
  ],

  'Safety & Clinical': [
    E('safety.screening_required', 'Screening required', 'A few health questions before we start', 'warning', EI, { mandatory: true }),
    E('safety.screening_passed', 'Screening passed', 'You’re cleared for the standard programme', 'success', EI),
    E('safety.screening_limited', 'Screening limited the programme', 'We’ve limited some movements for now', 'warning', EI, { mandatory: true, guardianCopy: true }),
    E('safety.contraindication_matched', 'Contraindication matched', 'We’ve removed some movements from your plan', 'warning', EI, { mandatory: true }),
    E('safety.movement_blocked', 'Movement blocked on safety grounds', 'That one isn’t suitable right now', 'warning', I, { mandatory: true }),
    E('safety.standing_clearance_required', 'Standing clearance required', 'Standing movements need a clearance first', 'warning', EI, { mandatory: true }),
    E('safety.pain_reported', 'Pain reported', 'Thanks for telling us — we’ve adjusted', 'warning', EI, { mandatory: true }),
    E('safety.stop_advice_issued', 'Stop advice issued', 'Please stop and seek advice', 'critical', EIS, { mandatory: true, quietHoursExempt: true, guardianCopy: true }),
    E('clinical.red_flag_detected', 'Red-flag pattern detected', 'Something we’d like you to check', 'critical', EIS, { mandatory: true, quietHoursExempt: true, guardianCopy: true }),
    E('clinical.escalation_opened', 'Clinical escalation opened', 'We’ve flagged this for review', 'warning', EI, { mandatory: true, guardianCopy: true }),
    E('clinical.escalation_closed', 'Clinical escalation closed', 'That review is complete', 'info', EI),
    E('clinical.signposted_to_care', 'Signposted to care', 'Where to get help with this', 'warning', EI, { mandatory: true, guardianCopy: true }),
    E('safeguarding.flag_raised', 'Safeguarding flag raised', 'A safeguarding review has started', 'warning', EI, { mandatory: true, guardianCopy: true }),
    E('safeguarding.lead_notified', 'Safeguarding lead notified', 'Designated safeguarding lead notified', 'critical', EIS, { mandatory: true, quietHoursExempt: true }),
  ],

  'FoodLens & Nutrition': [
    E('foodlens.capture_received', 'Capture received', 'Reading your plate', 'info', I),
    E('foodlens.capture_unusable', 'Capture unusable', 'We couldn’t read that one — try again', 'warning', I),
    E('foodlens.analysis_ready', 'Analysis ready', 'Your meal analysis is ready', 'success', IP),
    E('foodlens.low_confidence', 'Low confidence result', 'We’re not confident about this one', 'warning', I),
    E('foodlens.allergen_present', 'Allergen present', 'Contains {{item}}', 'critical', IP, { mandatory: true, quietHoursExempt: true, guardianCopy: true }),
    E('foodlens.allergen_unconfirmed', 'Allergen cannot be confirmed', 'We cannot confirm {{item}} from a photograph', 'warning', I, { mandatory: true }),
    E('foodlens.barcode_verified', 'Barcode verified', 'Verified from the label', 'success', I),
    E('foodlens.swap_simulated', 'Swap simulated', 'Here’s what changing {{item}} does', 'info', I),
    E('foodlens.plant_points_milestone', 'Plant points milestone', '{{item}} different plants this week', 'success', IP),
    E('foodlens.weekly_pattern', 'Weekly pattern ready', 'Your week in food', 'info', EI),
    E('foodlens.energy_hidden_minor', 'Energy figures withheld', 'We don’t show energy figures under 18', 'info', I, { mandatory: true }),
  ],

  BodyCommand: [
    E('body.assessment_ready', 'Assessment ready', 'Your body balance assessment', 'info', EI, { adultOnly: true }),
    E('body.pathway_assigned', 'Pathway assigned', 'Your pathway is {{item}}', 'info', EI, { adultOnly: true }),
    E('body.pathway_changed', 'Pathway changed', 'Your pathway has changed to {{item}}', 'info', EI, { adultOnly: true }),
    E('body.metrics_opt_in_confirmed', 'Body metrics opt-in confirmed', 'Body metrics are now visible to you', 'info', EI, { adultOnly: true, mandatory: true }),
    E('body.metrics_opt_out_confirmed', 'Body metrics opt-out confirmed', 'Body metrics are hidden again', 'info', EI, { adultOnly: true }),
    E('body.measurement_recorded', 'Measurement recorded', 'Measurement saved', 'info', I, { adultOnly: true }),
    E('body.trend_ready', 'Trend ready', 'Your monthly trend', 'info', EI, { adultOnly: true }),
    E('body.rate_of_change_flagged', 'Rate of change flagged', 'This is changing faster than we’d expect', 'warning', EI, { adultOnly: true, mandatory: true }),
    E('body.extreme_request_declined', 'Extreme change request declined', 'We won’t plan for that target', 'warning', EI, { adultOnly: true, mandatory: true }),
    E('body.plan_updated', 'Plan updated', 'Your daily plan has been updated', 'info', I, { adultOnly: true }),
  ],

  'Challenges & Crews': [
    E('challenge.invitation_received', 'Challenge invitation', '{{actor}} invited you to {{item}}', 'info', [...IP, 'whatsapp']),
    E('challenge.started', 'Challenge started', '{{item}} has started', 'info', IP),
    E('challenge.daily_progress', 'Daily progress', 'Your crew today', 'info', I),
    E('challenge.milestone_reached', 'Milestone reached', 'Your crew hit {{item}}', 'success', IP),
    E('challenge.finished', 'Challenge finished', '{{item}} is complete', 'success', EI),
    E('challenge.auto_withdrawn', 'Auto-withdrawn from a challenge', 'We’ve taken you out — no cost to your crew', 'info', EI),
    E('challenge.withdrawal_no_penalty', 'Withdrawal recorded, no penalty', 'Your crew is unaffected', 'info', I),
    E('crew.member_joined', 'Crew member joined', '{{name}} joined your crew', 'info', I),
    E('crew.member_left', 'Crew member left', '{{name}} left your crew', 'info', I),
    E('crew.support_received', 'Support received', '{{name}} backed you up', 'success', IP),
    E('crew.matchmaking_complete', 'Matchmaking complete', 'We found you a crew', 'success', EI),
    E('crew.reported_content', 'Content reported', 'A report has been received', 'warning', EI, { mandatory: true, guardianCopy: true }),
    E('crew.moderation_action', 'Moderation action taken', 'Action taken on reported content', 'warning', EI, { mandatory: true, guardianCopy: true }),
  ],

  'Wearables & Devices': [
    E('wearable.connect_requested', 'Connection requested', 'Connect {{item}} to JESS MOVE', 'info', EI),
    E('wearable.connected', 'Device connected', '{{item}} is connected', 'success', EI),
    E('wearable.disconnected', 'Device disconnected', '{{item}} was disconnected', 'warning', EI),
    E('wearable.sync_stale', 'Data is stale', 'We haven’t heard from {{item}} in a while', 'warning', I),
    E('wearable.sync_restored', 'Sync restored', '{{item}} is syncing again', 'success', I),
    E('wearable.scope_degraded', 'Scope revoked, feature degraded', 'One feature is less precise now', 'warning', EI, { mandatory: true }),
    E('wearable.conflict_detected', 'Sources disagree', 'Two devices disagree — we’re using {{item}}', 'info', I),
    E('wearable.refused_data', 'Data refused on ingest', 'We declined some data from {{item}}', 'info', I, { mandatory: true }),
    E('wearable.revocation_complete', 'Revocation complete', 'We’ve deleted what {{item}} sent us', 'success', EI, { mandatory: true }),
    E('wearable.battery_low', 'Device battery low', '{{item}} is low on battery', 'info', I),
  ],

  'Progress & Insight': [
    E('insight.weekly_ready', 'Weekly insight ready', 'Your week', 'info', [...EI, 'whatsapp']),
    E('insight.monthly_ready', 'Monthly insight ready', 'Your month', 'info', EI),
    E('insight.streak_milestone', 'Streak milestone', '{{item}} days', 'success', IP),
    E('insight.personal_best', 'Personal best', 'That’s your best {{item}} yet', 'success', IP),
    E('insight.trend_improving', 'Trend improving', 'Things are moving in the right direction', 'success', I),
    E('insight.trend_declining', 'Trend declining', 'This week was quieter — here’s what changed', 'info', I),
    E('insight.prom_prompt', 'Outcome measure prompt', 'Two quick questions about how you feel', 'info', EI),
    E('insight.goal_reached', 'Goal reached', 'You reached {{item}}', 'success', EIP),
    E('insight.goal_missed_no_blame', 'Goal missed', 'That one didn’t land. Next.', 'info', I),
    E('insight.export_ready', 'Data export ready', 'Your export is ready', 'success', EI, { mandatory: true }),
  ],

  'Organisation & Workplace': [
    E('org.application_received', 'Organisation application received', 'We received your application for {{enterprise}}', 'info', EI, { adultOnly: true }),
    E('org.verification_started', 'Verification started', 'Verification of {{enterprise}} has started', 'info', EI, { adultOnly: true }),
    E('org.documents_requested', 'Documents requested', 'Documents needed to verify {{enterprise}}', 'warning', EI, { adultOnly: true }),
    E('org.documents_approved', 'Documents approved', 'Your documents were approved', 'success', EI, { adultOnly: true }),
    E('org.activated', 'Organisation activated', '{{enterprise}} is live on JESS MOVE', 'success', EIP, { adultOnly: true }),
    E('org.seat_invitation', 'Seat invitation', '{{actor}} invited you to {{enterprise}}', 'info', [...EI, 'whatsapp'], { adultOnly: true }),
    E('org.seat_invitation_reminder', 'Invitation reminder', 'Reminder: your invitation to {{enterprise}}', 'info', EI, { adultOnly: true }),
    E('org.seat_accepted', 'Seat accepted', '{{name}} accepted the invitation', 'success', I, { adultOnly: true }),
    E('org.seat_removed', 'Seat removed', 'Your access to {{enterprise}} has ended', 'warning', EI, { adultOnly: true, mandatory: true }),
    E('org.minimum_seats_not_met', 'Below the seat minimum', 'Organisation plans start at {{item}} seats', 'info', EI, { adultOnly: true }),
    E('org.report_ready', 'Cohort report ready', 'Your {{item}} report is ready', 'info', EI, { adultOnly: true }),
    E('org.report_suppressed', 'Report suppressed below k-anonymity', 'Too few people to report on', 'info', EI, { adultOnly: true, mandatory: true }),
    E('org.individual_view_refused', 'Individual view refused', 'That view does not exist on this platform', 'warning', EI, { adultOnly: true, mandatory: true }),
    E('org.renewal_reminder', 'Renewal reminder', 'Your renewal is coming up', 'info', EI, { adultOnly: true }),
  ],

  'Growth & Partners': [
    E('partner.application_received', 'Partner application received', 'We received your Growth Partner application', 'info', EI, { adultOnly: true }),
    E('partner.approved', 'Partner approved', 'You’re in — your referral link is ready', 'success', EI, { adultOnly: true }),
    E('partner.rejected', 'Partner application declined', 'An update on your application', 'info', EI, { adultOnly: true }),
    E('referral.registered', 'Referral registered', 'Someone signed up through your link', 'info', I, { adultOnly: true }),
    E('referral.converted', 'Referral converted to paid', 'A referral just became a paying customer', 'success', [...EIP, 'whatsapp'], { adultOnly: true }),
    E('referral.held_for_review', 'Referral held for review', 'One referral is being checked', 'warning', EI, { adultOnly: true }),
    E('referral.rejected_fraud', 'Referral rejected', 'A referral did not pass our checks', 'warning', EI, { adultOnly: true, mandatory: true }),
    E('referral.reversed', 'Referral reversed', 'A referral was reversed after a refund', 'warning', EI, { adultOnly: true, mandatory: true }),
    E('reward.tier_reached', 'Reward tier reached', 'You reached {{item}}', 'success', EIP, { adultOnly: true }),
    E('reward.acu_granted', 'ACU reward granted', '{{amount}} added to your wallet', 'success', EI, { adultOnly: true }),
    E('commission.unlocked', 'Commission unlocked', 'Lifetime commission is now unlocked', 'success', EIP, { adultOnly: true }),
    E('commission.accrued', 'Commission accrued', 'Commission accrued this month', 'info', EI, { adultOnly: true }),
    E('commission.lifetime_cap_reached', 'Lifetime cap reached on a customer', 'You reached the per-customer cap', 'info', EI, { adultOnly: true, mandatory: true }),
    E('payout.kyc_required', 'KYC required before payout', 'We need to verify you before paying out', 'warning', EI, { adultOnly: true, mandatory: true }),
    E('payout.below_minimum', 'Below the payout minimum', 'Your balance is below the {{amount}} minimum', 'info', EI, { adultOnly: true }),
    E('payout.scheduled', 'Payout scheduled', 'Your payout is scheduled for {{date}}', 'info', EI, { adultOnly: true }),
    E('payout.manual_review', 'Payout under manual review', 'This payout needs a manual check', 'warning', EI, { adultOnly: true }),
    E('payout.paid', 'Payout paid', 'We’ve paid {{amount}}', 'success', EI, { adultOnly: true }),
    E('payout.failed', 'Payout failed', 'Your payout did not go through', 'warning', EI, { adultOnly: true, mandatory: true }),
    E('partner.suspended', 'Partner account suspended', 'Your partner account has been suspended', 'critical', EIS, { adultOnly: true, mandatory: true }),
  ],

  'Support, Platform & Privacy': [
    E('support.ticket_created', 'Ticket created', 'Support ticket {{number}} created', 'info', EI),
    E('support.ticket_updated', 'Ticket updated', 'Update on ticket {{number}}', 'info', [...EI, 'whatsapp']),
    E('support.ticket_resolved', 'Ticket resolved', 'Ticket {{number}} resolved', 'success', EI),
    E('support.accessibility_request', 'Accessibility request received', 'We’ve received your accessibility request', 'info', EI),
    E('system.maintenance_scheduled', 'Scheduled maintenance', 'Scheduled maintenance on {{date}}', 'info', EI),
    E('system.maintenance_emergency', 'Emergency maintenance', 'Emergency maintenance in progress', 'warning', EIS, { mandatory: true }),
    E('system.outage', 'Service disruption', 'Service disruption', 'critical', EIS, { mandatory: true, quietHoursExempt: true }),
    E('system.service_restored', 'Service restored', 'Service restored', 'success', EI),
    E('privacy.consent_request', 'Consent request', 'We need your consent for {{item}}', 'info', EI, { mandatory: true }),
    E('privacy.consent_updated', 'Consent updated', 'Your consent preferences were updated', 'info', EI, { mandatory: true }),
    E('privacy.data_export_ready', 'Data export ready', 'Your data export is ready', 'success', EI, { mandatory: true }),
    E('privacy.deletion_requested', 'Deletion requested', 'Account deletion requested', 'warning', EI, { mandatory: true, guardianCopy: true }),
    E('privacy.deletion_completed', 'Deletion completed', 'Your account and data have been deleted', 'info', EI, { mandatory: true }),
    E('privacy.retention_applied', 'Retention rule applied', 'Some older data has been removed', 'info', I, { mandatory: true }),
    E('privacy.dsar_received', 'Subject access request received', 'We received your request', 'info', EI, { mandatory: true }),
    E('privacy.policy_updated', 'Policy updated', 'Our {{item}} has changed', 'info', EI, { mandatory: true }),
    E('privacy.breach_notification', 'Breach notification', 'An important notice about your data', 'critical', EIS, { mandatory: true, quietHoursExempt: true, guardianCopy: true }),
  ],
};

/** The flattened catalogue, with the category folded into each row. */
export const EVENT_CATALOGUE: readonly CommEvent[] = EVENT_CATEGORIES.flatMap((category) =>
  CATALOGUE_BY_CATEGORY[category].map((e) => ({ ...e, category })),
);

export const CATALOGUE_SIZE = EVENT_CATALOGUE.length;

export function eventsIn(category: EventCategory): readonly CommEvent[] {
  return EVENT_CATALOGUE.filter((e) => e.category === category);
}

export function eventByKey(key: string): CommEvent | undefined {
  return EVENT_CATALOGUE.find((e) => e.key === key);
}

/** How many catalogue events name each channel by default. */
export function channelCoverage(): Readonly<Record<MessageChannel, number>> {
  const counts = Object.fromEntries(MESSAGE_CHANNELS.map((c) => [c, 0])) as Record<
    MessageChannel,
    number
  >;
  for (const e of EVENT_CATALOGUE) for (const c of e.channels) counts[c] += 1;
  return counts;
}

export const MANDATORY_EVENTS = EVENT_CATALOGUE.filter((e) => e.mandatory);
export const ADULT_ONLY_EVENTS = EVENT_CATALOGUE.filter((e) => e.adultOnly);
export const COACHING_EVENTS = EVENT_CATALOGUE.filter((e) => e.coaching);
export const GUARDIAN_COPY_EVENTS = EVENT_CATALOGUE.filter((e) => e.guardianCopy);

/* ------------------------------------------------------------------ *
 * Delivery resolution
 * ------------------------------------------------------------------ */

export type CoachPresence = 'full' | 'compact' | 'quiet' | 'off';

export interface Recipient {
  readonly userId: string;
  /** Verified age. Drives the rules that consent cannot unlock. */
  readonly age: number;
  readonly presence: CoachPresence;
  /** Channels the person has consented to. `mandatory` events ignore this. */
  readonly consentedChannels: readonly MessageChannel[];
  readonly inQuietHours: boolean;
  /** Law 2 — the context agent says the person cannot move right now. */
  readonly contextHeld: boolean;
  readonly coachingSentToday: number;
  readonly dailyCap: number;
  readonly hasGuardian: boolean;
}

export type SuppressionReason =
  | 'adult_only'
  | 'coach_off'
  | 'context_held'
  | 'quiet_hours'
  | 'daily_cap'
  | 'no_consented_channel'
  | 'no_wired_channel';

export interface DeliveryPlan {
  readonly event: string;
  readonly deliver: readonly MessageChannel[];
  readonly suppressed: readonly SuppressionReason[];
  /** Channels named by the event but dropped, and why. */
  readonly dropped: readonly { channel: MessageChannel; reason: string }[];
  readonly guardianCopy: boolean;
  readonly explanation: string;
}

/**
 * The whole delivery decision, in one deterministic function.
 *
 * Order matters and is the point. Age is checked before everything,
 * because it is the only rule with no override anywhere in the platform.
 * Coach presence is checked before quiet hours, because a person who
 * turned the coach off should not receive a coaching message merely
 * because it is the middle of the day.
 */
export function resolveDelivery(event: CommEvent, to: Recipient): DeliveryPlan {
  const suppressed: SuppressionReason[] = [];
  const dropped: { channel: MessageChannel; reason: string }[] = [];
  const isMinor = to.age < 18;

  const plan = (explanation: string, deliver: readonly MessageChannel[] = []): DeliveryPlan => ({
    event: event.key,
    deliver,
    suppressed,
    dropped,
    guardianCopy: Boolean(event.guardianCopy) && isMinor && to.hasGuardian,
    explanation,
  });

  // 1. Age. No consent, role or flag reaches past this.
  if (event.adultOnly && isMinor) {
    suppressed.push('adult_only');
    return plan('This event does not exist below 18. It is absent, not suppressed by preference.');
  }

  // 2. Coach presence. Off means off — consistent with mova.mayDeliver.
  if (event.coaching && to.presence === 'off') {
    suppressed.push('coach_off');
    return plan('The coach is off. Coaching messages do not send, and no severity overrides that.');
  }

  // 3. Law 2. A nudge into a moment the person cannot move is a defect.
  if (event.coaching && to.contextHeld) {
    suppressed.push('context_held');
    return plan('Context says the person cannot move right now. The hold is the correct outcome.');
  }

  // 4. Quiet hours and the daily cap. Statutory notices ignore both.
  if (to.inQuietHours && !event.quietHoursExempt && !event.mandatory) {
    suppressed.push('quiet_hours');
    return plan('Inside quiet hours, and this event is not exempt.');
  }
  if (event.coaching && to.coachingSentToday >= to.dailyCap) {
    suppressed.push('daily_cap');
    return plan(`The daily cap of ${to.dailyCap} coaching messages is reached.`);
  }

  // 5. Channels: wired first, then consent — which `mandatory` bypasses.
  let channels = event.channels.filter((c) => {
    if (!CHANNEL_DEFINITIONS[c].wired) {
      dropped.push({ channel: c, reason: 'no provider configured' });
      return false;
    }
    return true;
  });

  if (channels.length === 0) {
    suppressed.push('no_wired_channel');
    return plan('Every channel this event names is unwired.');
  }

  if (!event.mandatory) {
    channels = channels.filter((c) => {
      if (!to.consentedChannels.includes(c)) {
        dropped.push({ channel: c, reason: 'not consented' });
        return false;
      }
      return true;
    });
    if (channels.length === 0) {
      suppressed.push('no_consented_channel');
      return plan('The recipient has not consented to any channel this event uses.');
    }
  }

  return plan(
    event.mandatory
      ? 'Mandatory notice — delivered regardless of channel preferences, but still subject to the age rules.'
      : 'Delivered on every consented, wired channel this event names.',
    channels,
  );
}

/** Cost of one resolved plan, at list channel rates. */
export function deliveryCostGbp(plan: DeliveryPlan): number {
  const total = plan.deliver.reduce((sum, c) => sum + CHANNEL_DEFINITIONS[c].unitCostGbp, 0);
  return Number(total.toFixed(6));
}

/* ------------------------------------------------------------------ *
 * Templates
 * ------------------------------------------------------------------ */

export const TEMPLATE_TOKENS = [
  'name',
  'actor',
  'item',
  'enterprise',
  'plan',
  'amount',
  'number',
  'date',
  'duration',
  'mode',
] as const;
export type TemplateToken = (typeof TEMPLATE_TOKENS)[number];

export class UnknownTokenError extends Error {
  constructor(readonly token: string) {
    super(
      `"{{${token}}}" is not a known template token — a typo would otherwise ship as literal ` +
        'text in a subject line',
    );
    this.name = 'UnknownTokenError';
  }
}

/**
 * Renders a subject line. Unknown tokens throw rather than passing
 * through, because `{{firstname}}` in a live subject line is the classic
 * embarrassment and it is entirely preventable.
 */
export function renderSubject(
  template: string,
  values: Partial<Record<TemplateToken, string>>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, token: string) => {
    if (!(TEMPLATE_TOKENS as readonly string[]).includes(token)) {
      throw new UnknownTokenError(token);
    }
    return values[token as TemplateToken] ?? `[${token}]`;
  });
}

/** Every token a template references. Used to check a send has the data. */
export function tokensIn(template: string): readonly string[] {
  return [...template.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]!);
}

/* ------------------------------------------------------------------ *
 * Delivery records
 * ------------------------------------------------------------------ */

export const DELIVERY_STATUSES = [
  'sent',
  'logged',
  'sandbox',
  'suppressed',
  'failed',
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export interface DeliveryRecord {
  readonly id: string;
  readonly event: string;
  readonly channel: MessageChannel;
  readonly recipient: string;
  readonly status: DeliveryStatus;
  readonly provider: string;
  readonly at: string;
  readonly costGbp: number;
  readonly detail?: string;
}
