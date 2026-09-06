# The native shell

What a browser cannot do, and the platform already has server support
for:

| Capability | Server side | Client before this |
|---|---|---|
| Apple Health | `/wearables/ingest`, `apple_health` declared `transport: 'on_device'` | none |
| Health Connect | same, `health_connect` | none |
| Device calendar | `member_windows`, `windowsFromBusy` | `.ics` file import |
| Continuous motion | `ContextSignals.motionState`, used to withhold a prompt from somebody driving | always `unknown` |
| Push without "add to home screen" | VAPID, `/api/nudge/cron` | PWA only |

## Why Capacitor and not React Native

The web app is thirty routes and a 7,500-line design system. A React
Native rewrite would be a second product to keep correct, and the second
one would be wrong first — this repository's first refusal is *do not
rebuild what already works*. Capacitor wraps the existing app and adds
native capability to it.

The seam is `apps/frontend/app/native.ts`. In a browser every function in
it returns nothing and the product behaves exactly as it does today. The
web build has **no dependency on Capacitor**, so the site keeps building
whether or not this app exists.

## Status, honestly

| Part | State |
|---|---|
| `packages/shared/src/native.ts` — the contract and every mapping | **Tested.** 20 assertions, `native-bridge.test.ts` |
| `apps/frontend/app/native.ts` — the seam | **Typechecked and shipped.** Behaves as before in a browser |
| `capacitor.config.ts`, plugin TypeScript | **Typechecked** |
| `JessMoveNativePlugin.swift` | **Never compiled.** No macOS or Xcode here |
| `JessMoveNativePlugin.kt` and the three motion files | **Never compiled.** Java and Gradle are present, the Android SDK is not |
| Either app on a device | **Never run** |

Treat the first `xcodebuild` and the first Gradle build as the first real
check of the two platform files. They are conventional API use returning
shapes the shared contract validates, but nothing has compiled them.

## Building it

Neither can be done on the machine this was written on.

```bash
pnpm install
cd apps/mobile

pnpm add:android      # needs the Android SDK
pnpm add:ios          # needs macOS, Xcode and CocoaPods

pnpm sync
pnpm open:android     # or open:ios
```

`cap add` generates the `android/` and `ios/` projects. They are build
output — commit them or not by the same rule as any other generated
tree; nothing here depends on their being present.

### iOS, before it will run

`Info.plist` needs the four usage strings. iOS kills the app on the first
call to an API whose string is missing, with no error a user can read:

```
NSHealthShareUsageDescription
  Jess Move reads your steps, resting heart rate and sleep to decide when a
  two-minute movement break would actually fit. It never writes to Health.
NSCalendarsFullAccessUsageDescription
  Jess Move reads only the start and end times of your events, on this
  device, to find the gaps. Titles, locations and attendees are never read.
NSMotionUsageDescription
  Jess Move uses motion to know when not to interrupt you — while you are
  driving or cycling, it stays silent.
NSRemindersFullAccessUsageDescription   (only if reminders are added later)
```

Capabilities: HealthKit, Push Notifications, Background Modes → Remote
notifications.

### Android, before it will run

`AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.READ_CALENDAR" />
<uses-permission android:name="android.permission.ACTIVITY_RECOGNITION" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<!-- Health Connect, one per record type actually read -->
<uses-permission android:name="android.permission.health.READ_STEPS" />
<uses-permission android:name="android.permission.health.READ_HEART_RATE" />
<uses-permission android:name="android.permission.health.READ_SLEEP" />
```

Health Connect also requires the privacy-policy Activity and the
`ACTION_SHOW_PERMISSIONS_RATIONALE` intent filter, or Google Play rejects
the listing.

Motion needs two receivers registered, inside `<application>`. Both are
`exported="false"`: the transition receiver is woken by a `PendingIntent`
this app created, which does not need export, and an exported one would
let any app on the device fabricate a transition.

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

`BOOT_COMPLETED` needs its own permission alongside the others:

```xml
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
```

And the transition API comes from Play services location, in
`android/app/build.gradle`:

```gradle
implementation 'com.google.android.gms:play-services-location:21.3.0'
```

That dependency is the one thing here that is not Vercel or Firebase, and
it is not a new vendor decision: Play services is the OS's own activity
recognition on Android, the way `CoreMotion` is on iOS. It sends nothing
anywhere, has no account and no key. There is no alternative source for
this signal on the platform.

## The two things most likely to go wrong

**App Store rule 4.2, minimum functionality.** `server.url` points the
shell at the deployed site, so a reviewer's first impression is a
website in a webview — which is rejected. It is not one: it reads
HealthKit, the calendar and motion, and registers for push. Say so in the
review notes, and make sure the reviewer's demo account has a declared
window so a notification actually arrives during review.

**Health Connect data-type declaration.** Google Play requires every
health type read to be declared in the console and justified. The six in
`DATA_SCOPES` are the whole list; `NEVER_INGESTED` in the shared package
is what the app must never ask for, and the plugin's permission set is
built to match so the two cannot drift.

## How Android motion works, and why it is shaped oddly

iOS is the easy one: `CMMotionActivityManager` answers a historical query,
so `readMotion` asks what happened in the last three minutes and returns
the newest sample.

Android has no such call. Activity recognition is a *subscription*: the
app registers a `PendingIntent` and the OS delivers a transition — "they
started sitting still" — and then says nothing at all for as long as that
remains true. So three pieces exist instead of one:

| File | Job |
|---|---|
| `MotionSubscription.kt` | which transitions are asked for, and the `PendingIntent` they arrive on |
| `ActivityTransitionReceiver.kt` | receives them, converts boot-time nanos to wall clock, holds the last arrival |
| `MotionStore.kt` | two `SharedPreferences` keys, because the process dies and the state must not |

Three decisions in there are worth knowing before changing any of it.

**An ENTER is stored; an EXIT clears.** "Exited IN_VEHICLE" says somebody
stopped driving, not what they are doing instead. Storing an EXIT as a
state would have the shell assert `still` about somebody walking to their
next meeting.

**`observedAt` is now, and `continuingSince` is when the state began.**
The event may be hours old while the state is current — that is what a
transition means. Applying the three-minute sample window to the event
would make Android motion `unknown` within three minutes of every
transition, i.e. never work. The ceiling that stops this being unbounded
is `MAX_CONTINUING_STATE_MINUTES` in `packages/shared/src/native.ts`, six
hours, with the safety argument written out there — and it lives in the
shared package rather than in Kotlin precisely because that is the half a
test on this machine can reach.

**`FLAG_MUTABLE` on the `PendingIntent` is load-bearing.** The OS writes
the result into the intent. On Android 12+ an immutable one fails
silently: the receiver fires, `extractResult` returns null, and motion
looks implemented while always being `unknown`.

## What is still missing after this

Nothing on the motion path — but none of these four Kotlin files has been
compiled, and the first Gradle build is the first real check of them.
Confirm on a device that a drive produces `driving` and that force-stopping
the app and reopening it re-subscribes rather than answering with a state
frozen at the force-stop.
