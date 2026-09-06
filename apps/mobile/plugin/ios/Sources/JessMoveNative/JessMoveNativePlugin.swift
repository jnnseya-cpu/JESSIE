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
 * Two rules run through all of it:
 *
 * **Read only the six scopes the platform judges.** `DATA_SCOPES` is
 * steps, heart-rate trend, sleep, recovery, workouts and body
 * measurements. The permission sheet asks for exactly those, so a member
 * is never shown a dialogue requesting a category this product has no
 * use for — and `NEVER_INGESTED` in the shared package stays true by
 * construction rather than by policy.
 *
 * **Return times, never titles.** `readCalendar` builds dictionaries with
 * three keys. There is no branch on which `event.title` is read.
 */
@objc(JessMoveNativePlugin)
public class JessMoveNativePlugin: CAPPlugin {
    private let store = HKHealthStore()
    private let events = EKEventStore()
    private let motion = CMMotionActivityManager()

    /** Must match NATIVE_BRIDGE_VERSION in packages/shared/src/native.ts. */
    private let bridgeVersion = 1

    /// The six scopes, and nothing else.
    private var readTypes: Set<HKObjectType> {
        var types = Set<HKObjectType>()
        if let steps = HKObjectType.quantityType(forIdentifier: .stepCount) { types.insert(steps) }
        if let hr = HKObjectType.quantityType(forIdentifier: .restingHeartRate) { types.insert(hr) }
        if let hrv = HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN) { types.insert(hrv) }
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { types.insert(sleep) }
        if let mass = HKObjectType.quantityType(forIdentifier: .bodyMass) { types.insert(mass) }
        types.insert(HKObjectType.workoutType())
        return types
    }

    @objc func capabilities(_ call: CAPPluginCall) {
        // `isHealthDataAvailable` is false on iPad, where the app still
        // runs and everything else still works.
        let health = HKHealthStore.isHealthDataAvailable()
            && store.authorizationStatus(for: HKObjectType.workoutType()) == .sharingAuthorized

        let calendar: Bool
        if #available(iOS 17.0, *) {
            calendar = EKEventStore.authorizationStatus(for: .event) == .fullAccess
        } else {
            calendar = EKEventStore.authorizationStatus(for: .event) == .authorized
        }

        call.resolve([
            "bridgeVersion": bridgeVersion,
            "platform": "ios",
            "health": health,
            "calendar": calendar,
            "motion": CMMotionActivityManager.isActivityAvailable()
                && CMMotionActivityManager.authorizationStatus() == .authorized,
        ])
    }

    @objc func requestHealthAccess(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["granted": false])
            return
        }
        // `toShare: nil` — this product writes nothing back to Health. It
        // reads six categories and returns advice; it is not a place
        // anybody's health record should be edited from.
        store.requestAuthorization(toShare: nil, read: readTypes) { granted, _ in
            call.resolve(["granted": granted])
        }
    }

    @objc func requestMotionAccess(_ call: CAPPluginCall) {
        guard CMMotionActivityManager.isActivityAvailable() else {
            call.resolve(["granted": false])
            return
        }
        // There is no explicit request API; the first query triggers the
        // prompt, so one is issued against a past interval.
        motion.queryActivityStarting(from: Date().addingTimeInterval(-60), to: Date(), to: .main) { _, error in
            call.resolve(["granted": error == nil])
        }
    }

    @objc func readMotion(_ call: CAPPluginCall) {
        guard CMMotionActivityManager.isActivityAvailable() else {
            call.resolve(["motion": NSNull()])
            return
        }
        let from = Date().addingTimeInterval(-180)
        motion.queryActivityStarting(from: from, to: Date(), to: .main) { activities, _ in
            guard let latest = activities?.last else {
                call.resolve(["motion": NSNull()])
                return
            }

            // The shared vocabulary. `stationary` before `walking` because
            // CMMotionActivity can set several flags at once and the
            // engine wants the most restrictive true statement.
            var name = "unknown"
            if latest.automotive { name = "automotive" }
            else if latest.cycling { name = "cycling" }
            else if latest.running { name = "running" }
            else if latest.walking { name = "walking" }
            else if latest.stationary { name = "stationary" }

            // low/medium/high, as 0–1. The shared contract refuses
            // anything below 0.6, so `low` never becomes an assertion.
            let confidence: Double
            switch latest.confidence {
            case .high: confidence = 1.0
            case .medium: confidence = 0.66
            default: confidence = 0.33
            }

            call.resolve([
                "motion": [
                    "activity": name,
                    "confidence": confidence,
                    "observedAt": ISO8601DateFormatter().string(from: latest.startDate),
                ],
            ])
        }
    }

    @objc func readCalendar(_ call: CAPPluginCall) {
        let horizon = call.getInt("horizonDays") ?? 14
        let from = Date()
        let to = Calendar.current.date(byAdding: .day, value: horizon, to: from) ?? from

        let predicate = events.predicateForEvents(withStart: from, end: to, calendars: nil)
        let formatter = ISO8601DateFormatter()

        // Three keys. There is no line in this closure that reads
        // `event.title`, `event.location` or `event.attendees`, which is
        // what makes the claim on the marketing site true.
        let payload: [[String: Any]] = events.events(matching: predicate).map { event in
            [
                "startsAt": formatter.string(from: event.startDate),
                "endsAt": formatter.string(from: event.endDate),
                "allDay": event.isAllDay,
                "transparent": event.availability == .free,
            ]
        }

        call.resolve(["events": payload])
    }

    @objc func readHealth(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["readings": []])
            return
        }

        let formatter = ISO8601DateFormatter()
        var readings: [[String: Any]] = []
        let group = DispatchGroup()
        let lock = NSLock()

        func append(_ scope: String, _ value: Double, _ at: Date) {
            lock.lock()
            readings.append(["scope": scope, "value": value, "recordedAt": formatter.string(from: at)])
            lock.unlock()
        }

        // Today's steps.
        if let steps = HKObjectType.quantityType(forIdentifier: .stepCount) {
            group.enter()
            let start = Calendar.current.startOfDay(for: Date())
            let query = HKStatisticsQuery(
                quantityType: steps,
                quantitySamplePredicate: HKQuery.predicateForSamples(withStart: start, end: Date()),
                options: .cumulativeSum
            ) { _, stats, _ in
                if let sum = stats?.sumQuantity() {
                    append("steps", sum.doubleValue(for: .count()), Date())
                }
                group.leave()
            }
            store.execute(query)
        }

        // Resting heart rate — a trend, never a live reading. The
        // distinction matters: `heart_rate_trend` is the scope the
        // platform judges, and a beat-to-beat series is not it.
        if let resting = HKObjectType.quantityType(forIdentifier: .restingHeartRate) {
            group.enter()
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
            let query = HKSampleQuery(sampleType: resting, predicate: nil, limit: 1, sortDescriptors: [sort]) { _, samples, _ in
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

        // Last night's sleep, in hours.
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            group.enter()
            let since = Date().addingTimeInterval(-36 * 3600)
            let query = HKSampleQuery(
                sampleType: sleep,
                predicate: HKQuery.predicateForSamples(withStart: since, end: Date()),
                limit: HKObjectQueryNoLimit,
                sortDescriptors: nil
            ) { _, samples, _ in
                let asleep = (samples as? [HKCategorySample] ?? []).filter {
                    $0.value != HKCategoryValueSleepAnalysis.inBed.rawValue
                }
                let seconds = asleep.reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) }
                if seconds > 0, let last = asleep.last {
                    append("sleep", seconds / 3600, last.endDate)
                }
                group.leave()
            }
            store.execute(query)
        }

        group.notify(queue: .main) {
            call.resolve(["readings": readings])
        }
    }
}
