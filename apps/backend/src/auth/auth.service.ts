import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { AccountKind } from '@jessmove/shared';
import { ProfilesService } from '../accounts/profiles.service';
import { MailService } from '../mail/mail.service';
import { PushService } from '../push/push.service';
import { sniffImage, stripImageMetadata } from '../storage/image-bytes';
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
  ) {}

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
   * Humans-only, without a CAPTCHA vendor: the form token must exist, be
   * ours, and be older than a bot's instant submit; the honeypot must be
   * empty (the DTO enforces that); and each IP gets a sliding window.
   * Every refusal is the same flat sentence — no oracle for scripts.
   */
  private readonly attempts = new Map<string, number[]>();

  assertHuman(challenge: string | undefined, ip: string, kind: 'register' | 'login'): void {
    if (!this.configured()) return;

    const flat = new BadRequestException(
      'that submission did not look like a person — reload the page and try again',
    );
    if (!challenge) throw flat;
    const data = verifyActionToken('human_check', challenge, this.secret());
    if (!data?.t) throw flat;
    const ageSeconds = Math.floor(Date.now() / 1000) - Number(data.t);
    // A password manager plus a fast human needs ~2s; a script needs ~0.
    if (ageSeconds < (kind === 'register' ? 3 : 2)) throw flat;

    const key = `${kind}:${ip}`;
    const now = Date.now();
    const windowMs = 10 * 60 * 1000;
    const recent = (this.attempts.get(key) ?? []).filter((t) => now - t < windowMs);
    recent.push(now);
    this.attempts.set(key, recent);
    if (recent.length > (kind === 'register' ? 5 : 12)) {
      throw new HttpException(
        'too many attempts from this connection — wait a few minutes',
        429,
      );
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

    if (isMinor && input.guardianEmail) {
      // Best-effort: a mail outage must not block a registration. The
      // account stays dark either way until the link is clicked.
      void this.sendGuardianRequest(userId, input.displayName, input.guardianEmail).catch(() => {});
    } else {
      // Adults are welcomed straight away. A minor's inbox hears nothing
      // until their guardian has confirmed — that email is sent from the
      // confirmation click, not from here.
      void this.mail
        .send('account.registration.received', input.email, { name: input.displayName },
          `Welcome to JESS MOVE, ${input.displayName}.\n\n` +
          `Your account is live. Sign in any time at https://www.jessmove.com/account — ` +
          `your movement coaching, food intelligence and progress all live there.\n\n` +
          `Small Moves. Powerful Change.`,
        )
        .catch(() => {});
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

  /** The guardian's click. Returns the confirmed minor, or null for a bad link. */
  async confirmGuardian(token: string): Promise<{ minorName: string } | null> {
    const data = verifyActionToken('guardian_confirm', token, this.secret());
    if (!data?.m) return null;
    const updated = await this.users.confirmGuardian(data.m);
    if (!updated) return null;
    void this.mail
      .send('guardian.link_confirmed', data.g ?? '', { name: updated.displayName })
      .catch(() => {});
    // Now — and only now — the minor's own inbox hears from us.
    void this.mail
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
