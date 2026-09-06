# Publishing the apps

A step-by-step for getting Jess Move into the App Store and Google Play,
written for the machine that will actually do it — which is not the one
this was written on. There is no macOS, no Xcode and no Android SDK here,
so **no Swift or Kotlin file in this repository has ever been compiled**.
Treat the first `xcodebuild` and the first Gradle build as the first real
check of them, and budget for that rather than being surprised by it.

Everything below is ordered so that a failure stops you early and cheaply.
Do not skip to the store submission.

---

## 0 · What you need before starting

| Thing | Where it comes from | Cost |
|---|---|---|
| A Mac | macOS 14+, 60 GB free | — |
| Xcode 16+ | Mac App Store | free |
| Apple Developer Program | developer.apple.com/programs | £79/yr |
| Android Studio + SDK 35 | developer.android.com/studio | free |
| Google Play Console account | play.google.com/console | $25 once |
| Node 22 + pnpm 10 | `corepack enable` | — |
| A Firebase project | console.firebase.google.com | free tier |

Apple's account approval can take a few days for an organisation. Start it
first; everything else can proceed while it clears.

---

## 1 · Build the two projects locally, before anything else

```bash
git clone <this repo> && cd JESSIE
pnpm install
pnpm build            # shared → backend → frontend, in that order

cd apps/mobile
pnpm add:android      # generates android/
pnpm add:ios          # macOS only, generates ios/
pnpm sync
```

`cap add` generates `android/` and `ios/`. They are build output — commit
them or not by the same rule as any other generated tree; nothing in this
repository depends on their being present.

**This is the moment the platform code is compiled for the first time.**
Expect to fix things here. The Swift and Kotlin are conventional API use
returning shapes the shared contract validates and tests, but a compiler
has never seen them.

---

## 2 · Wire the native projects

`cap add` does not know about permissions, capabilities or dependencies.
These are one-time edits to the generated projects.

### 2a · iOS

`ios/App/App/Info.plist` — four usage strings. iOS **kills the app** on the
first call to an API whose string is missing, with no error a user can
read, so a missing one looks like a crash rather than a permissions
problem:

```
NSHealthShareUsageDescription
  Jess Move reads your steps, resting heart rate, sleep and workouts to
  decide when a two-minute movement break would actually fit. It never
  writes to Health.
NSCalendarsFullAccessUsageDescription
  Jess Move reads only the start and end times of your events, on this
  device, to find the gaps. Titles, locations and attendees are never read.
NSMotionUsageDescription
  Jess Move uses motion to know when not to interrupt you — while you are
  driving or cycling, it stays silent.
```

Xcode → target **App** → *Signing & Capabilities* → add:

- **HealthKit**
- **Push Notifications**
- **Background Modes** → Remote notifications

### 2b · Android

`android/app/src/main/AndroidManifest.xml` — permissions:

```xml
<uses-permission android:name="android.permission.READ_CALENDAR" />
<uses-permission android:name="android.permission.ACTIVITY_RECOGNITION" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<!-- Health Connect: four, matching NATIVE_HEALTH_SCOPES.android -->
<uses-permission android:name="android.permission.health.READ_STEPS" />
<uses-permission android:name="android.permission.health.READ_RESTING_HEART_RATE" />
<uses-permission android:name="android.permission.health.READ_SLEEP" />
<uses-permission android:name="android.permission.health.READ_EXERCISE" />
```

Inside `<application>`, the two motion receivers. Both `exported="false"`:
the transition receiver is woken by a `PendingIntent` this app created and
does not need export, and an exported one would let any app on the device
fabricate a transition.

```xml
<receiver
    android:name="com.jessmove.nativebridge.ActivityTransitionReceiver"
    android:exported="false" />

<receiver
    android:name="com.jessmove.nativebridge.BootReceiver"
    android:exported="false">
  <intent-filter>
    <action android:name="android.intent.action.BOOT_COMPLETED" />
    <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
  </intent-filter>
</receiver>
```

`android/app/build.gradle`:

```gradle
implementation 'com.google.android.gms:play-services-location:21.3.0'
```

That dependency is not a new vendor decision — Play services *is* the OS's
activity recognition on Android, the way CoreMotion is on iOS. It sends
nothing anywhere and has no account or key.

Health Connect also needs the privacy-policy Activity and the
`ACTION_SHOW_PERMISSIONS_RATIONALE` intent filter, or Google Play rejects
the listing.

---

## 3 · Push credentials, on the server

Nothing about push works until these are set. `GET /api/push/status`
reports which transports are live (`native.apns`, `native.fcm`).

### 3a · APNs (iOS)

iOS goes to Apple directly rather than through Firebase — Apple publishes
the endpoint, and routing it through a third party would put a vendor in
the path for no capability at all.

developer.apple.com → Certificates, Identifiers & Profiles → **Keys** →
new key with *Apple Push Notifications service* enabled. **The .p8
downloads once and cannot be downloaded again.**

Set in the Vercel dashboard on the API project:

| Name | Value |
|---|---|
| `APNS_KEY_ID` | the ten-character Key ID |
| `APNS_TEAM_ID` | the ten-character Team ID, top right of the console |
| `APNS_PRIVATE_KEY` | the whole .p8 including the BEGIN/END lines |
| `APNS_TOPIC` | `com.jessmove.app` |
| `APNS_ENVIRONMENT` | `sandbox` **only** for a development build |

> **The one that will bite you.** `APNS_ENVIRONMENT` defaults to
> production deliberately. A production token sent to the sandbox host
> returns `BadDeviceToken`, which the delivery path correctly treats as a
> dead device — so setting it to `sandbox` in production silently deletes
> every real registration, one per notification, until nobody is
> subscribed. If you test with a development build, use a separate
> deployment.

### 3b · FCM (Android)

Firebase console → your project → Project settings → **Service accounts**
→ Generate new private key. The JSON holds all three values.

| Name | Value |
|---|---|
| `FCM_PROJECT_ID` | `project_id` |
| `FCM_CLIENT_EMAIL` | `client_email` |
| `FCM_PRIVATE_KEY` | `private_key`, the whole PEM |

Also download `google-services.json` from the same console and drop it in
`android/app/`. Without it the app cannot register with FCM at all.

Both private keys survive a Vercel environment variable as literal `\n`
rather than newlines; the server un-escapes them on read, so paste them as
they come.

---

## 4 · Run it on a real device, before submitting

```bash
cd apps/mobile
pnpm sync
pnpm open:ios        # or pnpm open:android
```

Run on a physical device, not a simulator — HealthKit, Health Connect,
motion and push all behave differently or not at all in a simulator.

Work through this list. Every item is something that has never been
observed, and the first four are the ones most likely to be wrong:

- [ ] **The bridge connects at all.** Sign in and open Account. If the app
      behaves exactly like the website — no device-calendar button,
      notifications reported as unsupported — then
      `window.Capacitor.Plugins.JessMoveNative` is not reaching the page
      and nothing else on this list can pass.
- [ ] **The HealthKit sheet lists four categories**, not six: steps,
      resting heart rate, sleep, workouts.
- [ ] **Health turns on without a restart.** Grant it, then confirm the
      account page reflects it immediately.
- [ ] **A notification arrives on a locked phone**, and tapping it opens
      `/account` rather than wherever the app was last.
- [ ] Calendar access can be granted, and the device-calendar button
      produces windows.
- [ ] Grant a permission in the system Settings app, return to Jess Move,
      and confirm it takes effect without a reload.
- [ ] **Android motion:** take a drive; confirm prompts are withheld.
      Force-stop the app, reopen it, and confirm it re-subscribes rather
      than answering with a state frozen at the force-stop.
- [ ] Reboot the phone and confirm motion still works.

`POST /api/push/test {"userId":"u_…"}` (admin) proves delivery
independently of the scheduler.

---

## 5 · Flip the release flag

One line, in the same commit as the store submission:

```ts
// packages/shared/src/native.ts
export const MOBILE_APP_RELEASED = true;
```

That single fact corrects three things at once — the API's `ready` answer
for Apple Health and Health Connect, the "Connect today" column on
`/wearables`, and the on-device wording — so they cannot drift apart on
the day it matters. `pnpm test` asserts they move together.

Then add the store links to the site once the listings are live.

---

## 6 · Submit

### 6a · App Store

Xcode → Product → Archive → Distribute App → App Store Connect.

In App Store Connect: screenshots (6.7" and 5.5" iPhone minimum), a
privacy nutrition label, and the age rating.

**Privacy nutrition label — declare accurately:**

- Health & Fitness — *not linked to identity*, used for App Functionality
- Calendar — *not linked to identity*. Only start and end times are read;
  no title, location or attendee ever leaves the device, and
  `NativeCalendarEvent` has no field to put one in.
- Identifiers — the push token, linked to the account
- **No tracking.** The Meta Pixel and Google Tag run on public marketing
  pages only, never behind the login and never in the app.

> **Rule 4.2, minimum functionality — the most likely rejection.**
> `server.url` points the shell at the deployed site, so a reviewer's
> first impression is a website in a webview, and that gets rejected. It
> is not one. Say so in the review notes, explicitly:
>
> > Jess Move is not a web wrapper. The app reads Apple Health (steps,
> > resting heart rate, sleep, workouts), reads the device calendar's
> > free/busy times on-device, uses CoreMotion to suppress notifications
> > while the member is driving or cycling, and receives APNs push. None
> > of these is available to the website. The demo account below has a
> > movement window configured for [time] so a notification arrives
> > during review.
>
> Give a demo account with a declared window in the next hour, and check
> the notification actually fires before you submit.

### 6b · Google Play

```bash
cd apps/mobile/android
./gradlew bundleRelease      # produces an .aab
```

Sign it with an upload key you generate once and **back up** — losing it
means you cannot update the app.

In the Play Console: Data safety form, target audience, and the two that
reject listings:

- **Health Connect declaration.** Every data type read must be declared
  and justified. The list is exactly four —
  `NATIVE_HEALTH_SCOPES.android` — and nothing else may be requested.
- **Sensitive permissions.** `ACTIVITY_RECOGNITION` and
  `RECEIVE_BOOT_COMPLETED` both need a justification. The honest one:
  activity recognition is used to *suppress* notifications while driving
  or cycling, and boot completion re-registers that subscription, which
  does not survive a restart.

Release to **internal testing** first, then closed, then production. Do
not go straight to production on a first submission.

---

## 7 · After the listings are live

- [ ] `MOBILE_APP_RELEASED = true` deployed
- [ ] Store links added to the site
- [ ] A real notification received on each platform, from the scheduler
      rather than from `/push/test`
- [ ] `GET /api/push/status` shows both transports
- [ ] Watch `nudge_runs` for a day: `failed` rows name the reason, and the
      reason should not be a credential problem

---

## What is still unknown, honestly

None of the Swift or Kotlin has been compiled. The shared contract they
answer through is tested — 27 assertions in `native-bridge.test.ts`, five
of which read the platform source directly because no compiler here can —
and the web half of the bridge has been proven against a faithful
simulation of what Capacitor injects. That is not the same as running.

The most likely first-build failures, in order:

1. Swift compilation errors in `JessMoveNativePlugin.swift`.
2. Kotlin compilation errors across the four files in `nativebridge/`.
3. A missing Info.plist string, which presents as a crash.
4. Health Connect permissions not matching the console declaration.
5. App Store rule 4.2.
