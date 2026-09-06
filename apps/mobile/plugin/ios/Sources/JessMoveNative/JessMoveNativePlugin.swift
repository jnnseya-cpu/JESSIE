import Foundation
import Capacitor
import HealthKit
import EventKit
import CoreMotion

/**
 * Apple Health, the calendar and motion — the three things a browser
 * cannot see.
 *
 * NOT COMPILED IN THIS REPOSITORY. There is no macOS or Xcode on the
 * machine this was written on, so this file has never been through a
 * compiler. It is conventional platform API use and the shapes it returns
 * are the ones `packages/shared/src/native.ts` validates and tests, but
 * treat the first `xcodebuild` as the first real check of it.
 *
 * Four rules run through all of it.
 *
 * **Ask for exactly the four scopes the disclosure names.** `/wearables`
 * publishes `PROVIDER_DEFINITIONS.apple_health.requests` — steps, resting
 * heart rate, sleep and workouts — and the server's `judgeSample` refuses
 * anything outside it. A fifth category on the permission sheet would
 * contradict a public promise and then be rejected on arrival anyway.
 * `HEALTH_SCOPES` below is that list, and `native-bridge.test.ts` reads
 * this file to check it has not drifted.
 *
 * **Return times, never titles.** `readCalendar` builds dictionaries with
 * four keys. There is no branch on which `event.title` is read.
 *
 * **Motion is transition-shaped here too.** `CMMotionActivity.startDate`
 * is when a state *began*, which for somebody sitting at a desk is hours
 * ago. Reporting that as `observedAt` made every desk worker — the exact
 * person this product is for — read as `unknown`. So iOS answers in the
 * same shape as Android: `observedAt` is now, `continuingSince` is when it
 * started, and the shared contract judges the second against
 * `MAX_CONTINUING_STATE_MINUTES`.
 *
 * **HealthKit will not say whether a read was granted.** By design, so an
 * app cannot infer that somebody has no data of a type. Every "is health
 * available" answer here is therefore about whether the sheet has been
 * shown, and the only proof of access is a read returning something.
 */
@objc(JessMoveNativePlugin)
public class JessMoveNativePlugin: CAPPlugin, CAPBridgedPlugin {

    /*
     * Capacitor 6 and later find Swift plugins through `CAPBridgedPlugin`
     * rather than the old Objective-C `CAP_PLUGIN` macro. Without this
     * conformance and this method list the bridge cannot see a single
     * method on this class, and every call from JavaScript fails as "not
     * implemented" — with the plugin otherwise looking perfectly correct.
     */
    public let identifier = "JessMoveNativePlugin"
    public let jsName = "JessMoveNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "capabilities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestHealthAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestCalendarAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestMotionAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readHealth", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readMotion", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readCalendar", returnType: CAPPluginReturnPromise),
    ]

    private let store = HKHealthStore()
    private let events = EKEventStore()
    private let motion = CMMotionActivityManager()

    /** Must match NATIVE_BRIDGE_VERSION in packages/shared/src/native.ts. */
    private let bridgeVersion = 1

    /**
     * Must match NATIVE_HEALTH_SCOPES.ios in packages/shared/src/native.ts.
     * Asserted by `native-bridge.test.ts`, which reads this line.
     */
    static let HEALTH_SCOPES = ["steps", "heart_rate_trend", "sleep", "workouts"]

    /**
     * How far back a continuing state may be believed, matching
     * `MAX_CONTINUING_STATE_MINUTES`.
     *
     * It is the query window rather than a filter: CoreMotion returns
     * activity objects whose start falls inside the range, so querying the
     * last three minutes returns nothing at all for somebody who has been
     * still since breakfast. Asking for six hours and letting the shared
     * contract apply the ceiling puts the judgement in the half that has
     * tests.
     */
    private let continuingCeiling: TimeInterval = 6 * 60 * 60

    /** One formatter. `ISO8601DateFormatter` is not cheap to build. */
    private let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    /* ── health types ───────────────────────────────────────────────── */

    private var stepType: HKQuantityType? { HKObjectType.quantityType(forIdentifier: .stepCount) }
    private var restingType: HKQuantityType? {
        HKObjectType.quantityType(forIdentifier: .restingHeartRate)
    }
    private var sleepType: HKCategoryType? {
        HKObjectType.categoryType(forIdentifier: .sleepAnalysis)
    }

    /// The four scopes, and nothing else. Order matches HEALTH_SCOPES.
    private var readTypes: Set<HKObjectType> {
        var types = Set<HKObjectType>()
        if let steps = stepType { types.insert(steps) }
        if let resting = restingType { types.insert(resting) }
        if let sleep = sleepType { types.insert(sleep) }
        types.insert(HKObjectType.workoutType())
        return types
    }

    /* ── capabilities ───────────────────────────────────────────────── */

    /**
     * Whether the health sheet has been through, for every type asked for.
     *
     * `authorizationStatus(for:)` is the obvious call and it is the wrong
     * one: it reports *share* authorisation, and this app requests
     * `toShare: nil`, so it can never return `.sharingAuthorized` and the
     * health capability would have been false forever.
     * `getRequestStatusForAuthorization` answers the question that can
     * actually be answered — whether asking again would show a sheet.
     *
     * `.unnecessary` therefore means "asked", not "granted". HealthKit
     * refuses to distinguish the two so that an app cannot learn a person
     * has no data of a type. The honest consequence: this can be true while
     * `readHealth` returns nothing, and that path already fails safe —
     * `toIngestBatch` produces no samples and `syncHealth` sends nothing.
     */
    private func healthAsked(_ done: @escaping (Bool) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            done(false)
            return
        }
        store.getRequestStatusForAuthorization(toShare: [], read: readTypes) { status, error in
            done(error == nil && status == .unnecessary)
        }
    }

    private var calendarGranted: Bool {
        if #available(iOS 17.0, *) {
            return EKEventStore.authorizationStatus(for: .event) == .fullAccess
        }
        return EKEventStore.authorizationStatus(for: .event) == .authorized
    }

    private var motionGranted: Bool {
        CMMotionActivityManager.isActivityAvailable()
            && CMMotionActivityManager.authorizationStatus() == .authorized
    }

    @objc func capabilities(_ call: CAPPluginCall) {
        // `isHealthDataAvailable` is false on iPad, where the app still
        // runs and everything else still works.
        healthAsked { [weak self] health in
            guard let self else { return }
            call.resolve([
                "bridgeVersion": self.bridgeVersion,
                "platform": "ios",
                "health": health,
                "calendar": self.calendarGranted,
                "motion": self.motionGranted,
            ])
        }
    }

    /* ── permission requests ────────────────────────────────────────── */

    @objc func requestHealthAccess(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["granted": false])
            return
        }
        // `toShare: nil` — this product writes nothing back to Health. It
        // reads four categories and returns advice; it is not a place
        // anybody's health record should be edited from.
        store.requestAuthorization(toShare: nil, read: readTypes) { [weak self] success, _ in
            // `success` only means the sheet was presented without error —
            // it is true when somebody declines everything. The request
            // status is re-read so the answer means the same thing here as
            // it does in `capabilities`.
            guard let self else {
                call.resolve(["granted": success])
                return
            }
            self.healthAsked { asked in call.resolve(["granted": asked]) }
        }
    }

    /**
     * The calendar prompt, which had no path at all before this.
     *
     * `readCalendar` returns an empty list without permission and nothing
     * ever asked for it, so `capabilities.calendar` could never become
     * true and the "Read this device's calendar" button was never rendered
     * on either platform. The feature existed and could not be reached.
     */
    @objc func requestCalendarAccess(_ call: CAPPluginCall) {
        if #available(iOS 17.0, *) {
            // Full access, because free/busy over a fortnight is a range
            // query. `requestWriteOnlyAccessToEvents` cannot read, and the
            // iOS 17 "add only" grant returns an empty result set rather
            // than an error, which would look like an empty calendar.
            events.requestFullAccessToEvents { granted, _ in
                call.resolve(["granted": granted])
            }
        } else {
            events.requestAccess(to: .event) { granted, _ in
                call.resolve(["granted": granted])
            }
        }
    }

    @objc func requestMotionAccess(_ call: CAPPluginCall) {
        guard CMMotionActivityManager.isActivityAvailable() else {
            call.resolve(["granted": false])
            return
        }
        if motionGranted {
            call.resolve(["granted": true])
            return
        }
        // There is no explicit request API; the first query triggers the
        // prompt. The status is then read directly rather than inferred
        // from the absence of an error — a query can fail for reasons that
        // have nothing to do with the member's answer.
        motion.queryActivityStarting(from: Date().addingTimeInterval(-60), to: Date(), to: .main) {
            [weak self] _, _ in
            call.resolve(["granted": self?.motionGranted ?? false])
        }
    }

    /* ── motion ─────────────────────────────────────────────────────── */

    /// The shared vocabulary in `packages/shared/src/native.ts`.
    private func classify(_ activity: CMMotionActivity) -> String? {
        // `stationary` last among the movement flags because
        // CMMotionActivity can set several at once and the most specific
        // true statement is the useful one.
        if activity.automotive { return "automotive" }
        if activity.cycling { return "cycling" }
        if activity.running { return "running" }
        if activity.walking { return "walking" }
        if activity.stationary { return "stationary" }
        return nil
    }

    @objc func readMotion(_ call: CAPPluginCall) {
        guard motionGranted else {
            call.resolve(["motion": NSNull()])
            return
        }

        let from = Date().addingTimeInterval(-continuingCeiling)
        motion.queryActivityStarting(from: from, to: Date(), to: .main) { [weak self] activities, _ in
            guard let self else {
                call.resolve(["motion": NSNull()])
                return
            }

            // The newest activity that classifies. CoreMotion emits objects
            // with every flag false — skipping them finds the last thing
            // actually known rather than reporting a gap as a fact.
            guard let latest = activities?.last(where: { self.classify($0) != nil }),
                  let name = self.classify(latest)
            else {
                call.resolve(["motion": NSNull()])
                return
            }

            // low/medium/high, as 0–1. The shared contract refuses
            // anything below 0.6, so `low` never becomes an assertion.
            let confidence: Double
            switch latest.confidence {
            case .high: confidence = 1.0
            case .medium: confidence = 0.66
            default: confidence = 0.33
            }

            /*
             * `observedAt` is now and `continuingSince` is when the state
             * began — the same shape Android's transition receiver
             * produces, and for the same reason. CoreMotion emits a new
             * activity when the classification changes and says nothing
             * while it holds, so silence since `startDate` is the evidence
             * that the state is current. Reporting `startDate` as
             * `observedAt` put every reading older than three minutes past
             * the staleness window, which for a person sitting at a desk
             * is all of them.
             */
            call.resolve([
                "motion": [
                    "activity": name,
                    "confidence": confidence,
                    "observedAt": self.iso.string(from: Date()),
                    "continuingSince": self.iso.string(from: latest.startDate),
                ],
            ])
        }
    }

    /* ── calendar ───────────────────────────────────────────────────── */

    @objc func readCalendar(_ call: CAPPluginCall) {
        guard calendarGranted else {
            call.resolve(["events": []])
            return
        }

        let horizon = call.getInt("horizonDays") ?? 14
        let from = Date()
        let to = Calendar.current.date(byAdding: .day, value: horizon, to: from) ?? from

        let predicate = events.predicateForEvents(withStart: from, end: to, calendars: nil)

        // Four keys. There is no line in this closure that reads
        // `event.title`, `event.location` or `event.attendees`, which is
        // what makes the claim on the marketing site true.
        let payload: [[String: Any]] = events.events(matching: predicate).map { event in
            [
                "startsAt": iso.string(from: event.startDate),
                "endsAt": iso.string(from: event.endDate),
                "allDay": event.isAllDay,
                "transparent": event.availability == .free,
            ]
        }

        call.resolve(["events": payload])
    }

    /* ── health ─────────────────────────────────────────────────────── */

    /**
     * Total seconds covered by a set of intervals, counting overlap once.
     *
     * Two sources writing the same night — a watch and a sleep-tracking
     * app, which is a common pairing rather than an edge case — produce
     * overlapping samples. Summing their durations reported fourteen hours
     * of sleep for a seven-hour night, and `heart_rate_trend` and `sleep`
     * feed a readiness score that would then have been confidently wrong.
     */
    private func mergedSeconds(_ intervals: [(start: Date, end: Date)]) -> Double {
        guard !intervals.isEmpty else { return 0 }
        let sorted = intervals.sorted { $0.start < $1.start }
        var total: Double = 0
        var current = sorted[0]

        for next in sorted.dropFirst() {
            if next.start <= current.end {
                if next.end > current.end { current.end = next.end }
            } else {
                total += current.end.timeIntervalSince(current.start)
                current = next
            }
        }
        return total + current.end.timeIntervalSince(current.start)
    }

    @objc func readHealth(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["readings": []])
            return
        }

        var readings: [[String: Any]] = []
        let group = DispatchGroup()
        let lock = NSLock()

        func append(_ scope: String, _ value: Double, _ at: Date) {
            lock.lock()
            readings.append(["scope": scope, "value": value, "recordedAt": iso.string(from: at)])
            lock.unlock()
        }

        let startOfDay = Calendar.current.startOfDay(for: Date())

        // steps — count, today so far. SCOPE_UNITS names the unit.
        if let steps = stepType {
            group.enter()
            let query = HKStatisticsQuery(
                quantityType: steps,
                quantitySamplePredicate: HKQuery.predicateForSamples(withStart: startOfDay, end: Date()),
                options: .cumulativeSum
            ) { _, stats, _ in
                if let sum = stats?.sumQuantity() {
                    append("steps", sum.doubleValue(for: .count()), Date())
                }
                group.leave()
            }
            store.execute(query)
        }

        // heart_rate_trend — a trend, never a live reading. The distinction
        // matters: `heart_rate_trend` is the scope the platform judges, and
        // a beat-to-beat series is on the never-ingested list.
        if let resting = restingType {
            group.enter()
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
            let query = HKSampleQuery(
                sampleType: resting, predicate: nil, limit: 1, sortDescriptors: [sort]
            ) { _, samples, _ in
                if let sample = samples?.first as? HKQuantitySample {
                    append(
                        "heart_rate_trend",
                        sample.quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute())),
                        sample.endDate
                    )
                }
                group.leave()
            }
            store.execute(query)
        }

        // sleep — hours of the last main sleep.
        if let sleep = sleepType {
            group.enter()
            let since = Date().addingTimeInterval(-36 * 3600)
            let query = HKSampleQuery(
                sampleType: sleep,
                predicate: HKQuery.predicateForSamples(withStart: since, end: Date()),
                limit: HKObjectQueryNoLimit,
                sortDescriptors: nil
            ) { _, samples, _ in
                /*
                 * `inBed` and `awake` are both excluded. Excluding only
                 * `inBed` — which is the obvious reading of the API — counts
                 * every awake interval the watch recorded as sleep, and
                 * somebody with a broken night is exactly the person whose
                 * readiness score most needs to be right.
                 */
                var excluded: Set<Int> = [HKCategoryValueSleepAnalysis.inBed.rawValue]
                if #available(iOS 16.0, *) {
                    excluded.insert(HKCategoryValueSleepAnalysis.awake.rawValue)
                }

                let asleep = (samples as? [HKCategorySample] ?? [])
                    .filter { !excluded.contains($0.value) }

                let seconds = self.mergedSeconds(asleep.map { ($0.startDate, $0.endDate) })
                if seconds > 0, let latestEnd = asleep.map({ $0.endDate }).max() {
                    // `.max()` rather than `.last` — no sort descriptor was
                    // given, so the array's order is HealthKit's, not time's.
                    append("sleep", seconds / 3600, latestEnd)
                }
                group.leave()
            }
            store.execute(query)
        }

        // workouts — minutes of deliberate exercise today. Declared in
        // `PROVIDER_DEFINITIONS.apple_health.requests` and accepted by the
        // server since the wearables module was written; nothing had ever
        // produced it.
        group.enter()
        let workoutQuery = HKSampleQuery(
            sampleType: HKObjectType.workoutType(),
            predicate: HKQuery.predicateForSamples(withStart: startOfDay, end: Date()),
            limit: HKObjectQueryNoLimit,
            sortDescriptors: nil
        ) { _, samples, _ in
            let workouts = (samples as? [HKWorkout] ?? [])
            // Merged for the same reason as sleep: a watch and a phone
            // recording one run are two samples of one workout.
            let seconds = self.mergedSeconds(workouts.map { ($0.startDate, $0.endDate) })
            if seconds > 0, let latestEnd = workouts.map({ $0.endDate }).max() {
                append("workouts", seconds / 60, latestEnd)
            }
            group.leave()
        }
        store.execute(workoutQuery)

        group.notify(queue: .main) {
            call.resolve(["readings": readings])
        }
    }
}
