import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import {
  DOOR_POLICY,
  FLAT_REFUSAL,
  type AccountKind,
  type HumanDoor,
} from '@jessmove/shared';
import { makePool } from '../db/pg';
import { ProfilesService } from '../accounts/profiles.service';

/** The slice of a pool the door counter uses. */
interface DoorPool {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}
import { MailService } from '../mail/mail.service';
import { PushService } from '../push/push.service';
import { sniffImage, stripImageMetadata } from '../storage/image-bytes';
import { ConversionsService } from '../tracking/conversions.service';
import { SecurityService } from '../security/security.service';
import { StorageService } from '../storage/storage.service';
import { hashPassword, verifyPassword } from './password';
import {
  issueActionToken,
  issueToken,
  verifyActionToken,
  verifyToken,
  type SessionPayload,
} from './token';
import { UserStore } from './user-store';

/**
 * A short, non-reversible marker for the password a reset link was issued
 * against. It is not a credential and it is never stored — it rides inside
 * the signed link so the link can tell whether the password has moved on.
 */
function passwordFingerprint(passwordHash: string): string {
  return createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);
}

/**
 * Registration, login, sessions.
 *
 * Decisions worth stating:
 *
 * **The account kind is derived, never chosen at signup.** Age under 18
 * makes a minor, 18 and over makes an adult. Elevated kinds — staff,
 * support, org admin — are never self-service; they are assigned by an
 * existing administrator through their own flow. A signup form that offers
 * "platform_staff" in a dropdown is a breach waiting for a crawler.
 *
 * **A minor's registration requires a guardian email, and the account
 * starts dark.** The guardian link must be confirmed before the account
 * activates — the same rule the account service already enforces, now with
 * a front door that cannot skip it.
 *
 * **Login failure is one message.** "Wrong email" versus "wrong password"
 * tells an attacker which emails exist. Both answers are the same sentence
 * and take roughly the same time, since the password check runs even when
 * the email finds nobody.
 */

const DUMMY_HASH_PROMISE = hashPassword('a-constant-decoy-password-1');

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly users: UserStore,
    private readonly profiles: ProfilesService,
    private readonly mail: MailService,
    private readonly storage: StorageService,
    private readonly push: PushService,
    private readonly security: SecurityService,
    private readonly conversions: ConversionsService,
  ) {
    this.pool = makePool(process.env.DATABASE_URL, 2);
  }

  /**
   * Used only by the door counter. Null without a database, in which case
   * the in-memory window is all there is — which is correct for local
   * development and is the pre-existing behaviour, not a new weakening.
   */
  private readonly pool: DoorPool | null;

  /**
   * Records this attempt and returns how many there have been in the
   * window, across every instance.
   *
   * A failure to count returns zero rather than throwing. The alternative
   * is that a database blip locks every member out of logging in, and a
   * rate limiter that becomes an outage is worse than the attack it
   * prevents — the in-memory window is still running underneath, so a
   * refusal is never lost entirely.
   */
  private async countAttempt(door: string, source: string, windowMinutes: number): Promise<number> {
    if (!this.pool) return 0;
    try {
      /*
       * `+ 1` for the attempt being inserted right now.
       *
       * A data-modifying CTE and the SELECT beside it both read the
       * snapshot taken at the start of the statement, so the row this
       * statement inserts is not visible to its own count. Without the
       * adjustment the limit is one attempt looser than the policy says —
       * small, but a rate limit that does not enforce its own published
       * number is a rate limit nobody can reason about.
       */
      const { rows } = await this.pool.query(
        `WITH inserted AS (
           INSERT INTO door_attempts (door, source) VALUES ($1, $2) RETURNING at
         )
         SELECT (count(*) + 1)::int AS n
           FROM door_attempts
          WHERE door = $1 AND source = $2
            AND at > now() - make_interval(mins => $3)`,
        [door, source, windowMinutes],
      );
      // Swept opportunistically, so the table stays about one window big
      // without a scheduled job this deployment has no way to run.
      if (Math.random() < 0.01) {
        await this.pool.query(`DELETE FROM door_attempts WHERE at < now() - interval '24 hours'`);
      }
      return Number(rows[0]?.n ?? 0);
    } catch {
      return 0;
    }
  }

  private secret(): string {
    return this.config.get<string>('AUTH_SECRET') ?? '';
  }

  configured(): boolean {
    return this.secret().length >= 32;
  }

  status() {
    return {
      configured: this.configured(),
      userStore: this.users.driver(),
      enforcing: this.enforcing(),
      note: this.configured()
        ? this.users.driver() === 'memory'
          ? 'Auth works, but users live in memory — set DATABASE_URL before anyone real registers.'
          : 'Auth live, users in Postgres.'
        : 'Set AUTH_SECRET (32+ random characters) to enable registration and login.',
    };
  }

  /**
   * Whether protected routes actually require a session. Off by default so
   * the pilot's /try and /console keep working; switched on with
   * AUTH_ENFORCE=true once real accounts exist. The status endpoint
   * reports it, so nobody mistakes open-for-the-pilot for secured.
   */
  enforcing(): boolean {
    return this.config.get<string>('AUTH_ENFORCE') === 'true';
  }

  private assertConfigured(): void {
    if (!this.configured()) {
      throw new BadRequestException(
        'authentication is not configured on this deployment — set AUTH_SECRET (32+ random characters)',
      );
    }
  }

  /** A signed, dated proof that a form was served. Costs nothing to honour. */
  issueChallenge(): { token: string } {
    return {
      token: issueActionToken('human_check', { t: String(Math.floor(Date.now() / 1000)) }, this.secret(), 1800),
    };
  }

  /**
   * Humans-only, without a CAPTCHA vendor.
   *
   * Four signals, none of which proves anything on its own and none of
   * which needs a third party to hold our members' behaviour: the form
   * token must exist, be ours and be older than a script's instant submit;
   * the honeypot must be empty (the DTO enforces that); and each source
   * gets a sliding window sized to the door.
   *
   * Every door in `HUMAN_DOORS` comes through here, not only the three
   * that started with it. The per-door numbers and the reason for each
   * live in `DOOR_POLICY` in the shared package, so a reviewer reads one
   * table rather than reverse-engineering a conditional — and so a door
   * added without a policy fails to compile.
   *
   * What it is not: proof. See `NOT_PROOF_OF_HUMANITY`, which is published
   * on the assurance page in those words.
   */
  /**
   * The in-memory window, kept as a fast path only.
   *
   * It used to be the whole limiter, and on serverless that made the
   * published policy untrue. "Twelve logins in ten minutes" was enforced
   * per warm instance and reset on every recycle, so an attacker got
   * twelve per instance for free and a clean slate whenever the platform
   * scaled — no cleverness required, ordinary load balancing does it.
   *
   * `door_attempts` is the real count now. This map still runs first
   * because it costs nothing and stops a burst against one instance
   * before it reaches the database.
   */
  private readonly attempts = new Map<string, number[]>();

  async assertHuman(challenge: string | undefined, ip: string, kind: HumanDoor): Promise<void> {
    if (!this.configured()) return;

    const policy = DOOR_POLICY[kind];
    const flat = new BadRequestException(FLAT_REFUSAL);

    /*
     * Volume first, before the token is even examined.
     *
     * The order matters more than it looks. Checking the token first means
     * a flood of garbage tokens costs a signature verification each, and
     * the attempt is never counted because the throw happens above the
     * counter — so the cheapest attack is also the one that never trips
     * the limit. Counting first makes every attempt expensive to the
     * caller and cheap to us, which is the right way round.
     */
    const key = `${kind}:${ip}`;
    const now = Date.now();
    const windowMs = policy.windowMinutes * 60 * 1000;
    const recent = (this.attempts.get(key) ?? []).filter((t) => now - t < windowMs);
    recent.push(now);
    this.attempts.set(key, recent);

    // The durable count. Whichever of the two trips first refuses.
    const across = await this.countAttempt(kind, ip, policy.windowMinutes);
    if (across > policy.attemptsPerWindow) {
      this.security.record({
        kind: 'rate_limited',
        source: ip,
        at: new Date().toISOString(),
        detail: `${kind}: ${across} attempts in ${policy.windowMinutes} minutes (all instances)`,
      });
      throw new HttpException('too many attempts from this connection — wait a few minutes', 429);
    }

    if (recent.length > policy.attemptsPerWindow) {
      this.security.record({
        kind: 'rate_limited',
        source: ip,
        at: new Date().toISOString(),
        detail: `${kind}: ${recent.length} attempts in ${policy.windowMinutes} minutes`,
      });
      throw new HttpException('too many attempts from this connection — wait a few minutes', 429);
    }

    const fail = (why: string) => {
      this.security.record({
        kind: 'human_check_failed',
        source: ip,
        at: new Date().toISOString(),
        detail: `${kind}: ${why}`,
      });
      throw flat;
    };

    if (policy.minTokenAgeSeconds > 0) {
      if (!challenge) fail('no form token');
      const data = verifyActionToken('human_check', challenge!, this.secret());
      if (!data?.t) fail('form token not ours or expired');
      const ageSeconds = Math.floor(Date.now() / 1000) - Number(data!.t);
      // A password manager plus a fast person needs a second or two; a
      // script needs none, and cannot buy the time without slowing down.
      if (ageSeconds < policy.minTokenAgeSeconds) fail(`submitted after ${ageSeconds}s`);
    }
  }


  async register(input: {
    email: string;
    password: string;
    displayName: string;
    age: number;
    guardianEmail?: string;
  }): Promise<{ token: string; userId: string; kind: AccountKind; pendingGuardian: boolean }> {
    this.assertConfigured();

    const existing = await this.users.byEmail(input.email);
    if (existing) {
      throw new ConflictException('an account already exists for that email address');
    }

    const isMinor = input.age < 18;
    // The one exception to "signup produces adult or minor": an email on
    // the ADMIN_EMAILS allow-list registers as platform staff. The list
    // lives in deployment configuration, never in a request.
    const kind: AccountKind = isMinor
      ? 'minor'
      : this.isAdminEmail(input.email)
        ? 'platform_staff'
        : 'adult';

    let guardianId: string | null = null;
    if (isMinor) {
      if (!input.guardianEmail) {
        throw new BadRequestException(
          'under 18, registration needs a guardian email — the account activates when they confirm',
        );
      }
      const guardian = await this.users.byEmail(input.guardianEmail);
      // A guardian who is not yet registered gets a placeholder link the
      // confirmation flow resolves; the account stays pending either way.
      guardianId = guardian?.userId ?? `pending:${input.guardianEmail.toLowerCase()}`;
    }

    const userId = `u_${randomUUID().slice(0, 12)}`;
    const passwordHash = await hashPassword(input.password);

    await this.users.create({
      userId,
      email: input.email,
      passwordHash,
      kind,
      age: input.age,
      guardianId,
      displayName: input.displayName,
    });

    // The profile is created through the same service the rest of the
    // platform uses, so every account rule applies to signups too.
    this.profiles.createAccount(userId, kind, input.age, guardianId ?? undefined);

    // Awaited on purpose, best-effort by construction: send() records a
    // failure instead of throwing, and on serverless a send that is not
    // awaited is suspended when the response returns — the classic
    // "the form said the email was on its way, and it never left".
    if (isMinor && input.guardianEmail) {
      // The account stays dark either way until the link is clicked.
      await this.sendGuardianRequest(userId, input.displayName, input.guardianEmail).catch(() => {});
    } else {
      // Adults are welcomed straight away. A minor's inbox hears nothing
      // until their guardian has confirmed — that email is sent from the
      // confirmation click, not from here.
      await this.mail
        .send('account.registration.received', input.email, { name: input.displayName },
          `Welcome to JESS MOVE, ${input.displayName}.\n\n` +
          `Your account is live. Sign in any time at https://www.jessmove.com/account — ` +
          `your movement coaching, food intelligence and progress all live there.\n\n` +
          `Small Moves. Powerful Change.`,
        )
        .catch(() => {});
    }

    /*
     * The signup conversion, sent server to server.
     *
     * Recorded here rather than from the browser because registration
     * happens on the account, where no advertising script is permitted —
     * and only for adults, because this platform does not profile children
     * for advertising and a minor's account is pending a guardian anyway.
     *
     * Not awaited: an advertising network must never sit on the path
     * between somebody pressing the button and having an account.
     */
    if (!isMinor) {
      this.conversions.record({ event: 'signed_up' });
    }

    const token = issueToken({ uid: userId, kind, age: input.age }, this.secret());
    return { token, userId, kind, pendingGuardian: isMinor };
  }

  private apiPublicUrl(): string {
    return (process.env.API_PUBLIC_URL ?? 'https://api.jessmove.com/api').replace(/\/$/, '');
  }

  private async sendGuardianRequest(
    minorId: string,
    minorName: string,
    guardianEmail: string,
  ): Promise<void> {
    const token = issueActionToken(
      'guardian_confirm',
      { m: minorId, g: guardianEmail.toLowerCase() },
      this.secret(),
      7 * 24 * 3600,
    );
    const link = `${this.apiPublicUrl()}/auth/guardian/confirm?token=${token}`;
    await this.mail.send('guardian.link_requested', guardianEmail, { name: minorName },
      `${minorName} (under 18) has registered on JESS MOVE and named you as their guardian.\n\n` +
      `Their account stays inactive until you confirm. If you agree to be their guardian, ` +
      `open this link:\n\n${link}\n\nThe link works for 7 days. If you don't recognise ` +
      `this request, ignore this email and nothing happens.`,
    );
  }

  private sitePublicUrl(): string {
    return (process.env.SITE_PUBLIC_URL ?? 'https://www.jessmove.com').replace(/\/$/, '');
  }

  /**
   * Forgot password. One flat answer whether or not the address has an
   * account — the form must never confirm which emails exist.
   */
  async forgotPassword(email: string): Promise<{ note: string }> {
    this.assertConfigured();
    const user = await this.users.byEmail(email);
    if (user) {
      // The link carries a fingerprint of the password it was issued
      // against. Changing the password changes the fingerprint, so the
      // link stops working the moment it is used — a stateless single-use
      // token, with no table to keep and nothing to expire.
      const token = issueActionToken(
        'password_reset',
        { u: user.userId, f: passwordFingerprint(user.passwordHash) },
        this.secret(),
        1800,
      );
      const link = `${this.sitePublicUrl()}/account/reset?token=${token}`;
      // Awaited: an un-awaited send is suspended with the serverless
      // instance the moment the flat answer goes out.
      await this.mail
        .send('password.reset_link', user.email, { name: user.displayName },
          `Hi ${user.displayName},\n\nSomeone asked to reset the password for this JESS MOVE ` +
          `account. If that was you, open this link — it works for 30 minutes:\n\n${link}\n\n` +
          `If it wasn't you, ignore this email; your password stays as it is.`,
        )
        .catch(() => {});
    }
    return { note: 'If that address has an account, a reset link is on its way.' };
  }

  /** The link's second half: a new password, then straight back in. */
  async resetPassword(token: string, newPassword: string): Promise<{ token: string; userId: string }> {
    this.assertConfigured();
    const data = verifyActionToken('password_reset', token, this.secret());
    if (!data?.u) {
      throw new BadRequestException('that reset link is not valid — it may have expired (30 minutes)');
    }

    // Used once, and only once. Without this a link kept working for its
    // whole thirty minutes: forwarded, or read from a shared inbox, it
    // could be used again after the member had already reset — which is
    // somebody else taking the account back.
    const current = await this.users.byId(data.u);
    if (!current || (data.f && data.f !== passwordFingerprint(current.passwordHash))) {
      throw new BadRequestException(
        'that reset link has already been used — ask for a fresh one if you still need it',
      );
    }
    let passwordHash: string;
    try {
      passwordHash = await hashPassword(newPassword);
    } catch {
      throw new BadRequestException('a password needs at least 10 characters');
    }
    const ok = await this.users.setPassword(data.u, passwordHash);
    if (!ok) throw new BadRequestException('that account no longer exists');

    const user = await this.users.byId(data.u);
    if (!user) throw new BadRequestException('that account no longer exists');
    await this.mail
      .send('password.reset.successful', user.email, { name: user.displayName })
      .catch(() => {});
    const session = issueToken({ uid: user.userId, kind: user.kind, age: user.age }, this.secret());
    return { token: session, userId: user.userId };
  }

  /** The guardian's click. Returns the confirmed minor, or null for a bad link. */
  async confirmGuardian(token: string): Promise<{ minorName: string } | null> {
    const data = verifyActionToken('guardian_confirm', token, this.secret());
    if (!data?.m) return null;
    const updated = await this.users.confirmGuardian(data.m);
    if (!updated) return null;
    await this.mail
      .send('guardian.link_confirmed', data.g ?? '', { name: updated.displayName })
      .catch(() => {});
    // Now — and only now — the minor's own inbox hears from us.
    await this.mail
      .send('account.registration.received', updated.email, { name: updated.displayName },
        `Hi ${updated.displayName} — your guardian has confirmed your JESS MOVE account, ` +
        `so it's live now.\n\nSign in at https://www.jessmove.com/account and have a look ` +
        `around. Small moves. Powerful change.`,
      )
      .catch(() => {});
    return { minorName: updated.displayName };
  }

  async login(email: string, password: string): Promise<{ token: string; userId: string; kind: AccountKind }> {
    this.assertConfigured();

    const user = await this.users.byEmail(email);
    // Run a hash comparison even when the email finds nobody, so the two
    // failures take the same time and return the same sentence.
    const ok = user
      ? await verifyPassword(password, user.passwordHash)
      : (await verifyPassword(password, await DUMMY_HASH_PROMISE), false);

    if (!user || !ok) {
      throw new UnauthorizedException('that email and password combination is not right');
    }

    // An existing adult account whose email joined ADMIN_EMAILS is
    // promoted at sign-in — the bootstrap for the first administrator.
    // Adults only: a minor's kind is never touched.
    let kind = user.kind;
    if (kind === 'adult' && this.isAdminEmail(user.email)) {
      const promoted = await this.users.setKind(user.userId, 'platform_staff');
      if (promoted) kind = promoted.kind;
    }

    const token = issueToken({ uid: user.userId, kind, age: user.age }, this.secret());
    return { token, userId: user.userId, kind };
  }

  private isAdminEmail(email: string): boolean {
    return (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
      .includes(email.trim().toLowerCase());
  }

  verify(token: string): SessionPayload | null {
    return verifyToken(token, this.secret());
  }

  async updateName(payload: SessionPayload, displayName: string) {
    const updated = await this.users.updateDisplayName(payload.uid, displayName.trim());
    if (!updated) throw new UnauthorizedException('this session belongs to no known account');
    return { displayName: updated.displayName };
  }

  /**
   * A profile picture or cover. Same discipline as every image on the
   * platform: format sniffed from the bytes, mime mismatch refused,
   * EXIF/GPS stripped before storage — and never for an under-18,
   * whatever the consent settings say.
   */
  async attachMedia(
    payload: SessionPayload,
    slot: 'avatar' | 'cover',
    mimeType: string,
    dataBase64: string,
  ) {
    const user = await this.users.byId(payload.uid);
    if (!user) throw new UnauthorizedException('this session belongs to no known account');
    if (user.age < 18) {
      throw new BadRequestException(
        'No photographic media on under-18 accounts, in any mode, under any consent setting.',
      );
    }

    const bytes = Buffer.from(dataBase64, 'base64');
    if (bytes.length === 0) throw new BadRequestException('The image is empty.');
    const sniffed = sniffImage(bytes);
    if (!sniffed.format) {
      throw new BadRequestException('Those bytes are not a JPEG, PNG or WebP photograph.');
    }
    if (mimeType !== `image/${sniffed.format}`) {
      throw new BadRequestException(
        `Declared ${mimeType} but the bytes are image/${sniffed.format} — refused as a disguised file.`,
      );
    }

    const clean = stripImageMetadata(bytes);
    const stored = await this.storage.put(
      `${slot}-${payload.uid}-${randomUUID()}`,
      clean,
      mimeType,
    );

    const updated = await this.users.setMedia(
      payload.uid,
      slot === 'avatar' ? { avatarUrl: stored.url } : { coverUrl: stored.url },
    );
    return {
      slot,
      url: stored.url,
      bytesRemoved: bytes.length - clean.length,
      avatarUrl: updated?.avatarUrl ?? null,
      coverUrl: updated?.coverUrl ?? null,
    };
  }

  /** The danger zone. Password re-entry required; gone means gone. */
  async deleteAccount(payload: SessionPayload, password: string): Promise<{ deleted: true }> {
    const user = await this.users.byId(payload.uid);
    if (!user) throw new UnauthorizedException('this session belongs to no known account');
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('that password is not right');

    try {
      this.profiles.remove(payload.uid);
    } catch {
      /* no in-memory profile on this instance — the durable rows are what matter */
    }
    await this.push.deleteForUser(payload.uid).catch(() => {});
    await this.users.delete(payload.uid);
    return { deleted: true };
  }

  /** Admin: find an account by name, email or exact id. Safe fields only. */
  async searchUsers(query: string) {
    const found = await this.users.search(query);
    return found.map((u) => ({
      userId: u.userId,
      displayName: u.displayName,
      email: u.email,
      kind: u.kind,
      age: u.age,
    }));
  }

  async me(payload: SessionPayload) {
    const user = await this.users.byId(payload.uid);
    if (!user) throw new UnauthorizedException('this session belongs to no known account');
    return {
      userId: user.userId,
      email: user.email,
      displayName: user.displayName,
      kind: user.kind,
      age: user.age,
      guardianLinked: user.guardianId !== null && !user.guardianId.startsWith('pending:'),
      guardianConfirmed: user.guardianConfirmed,
      avatarUrl: user.avatarUrl,
      coverUrl: user.coverUrl,
      sessionExpires: new Date(payload.exp * 1000).toISOString(),
    };
  }
}
