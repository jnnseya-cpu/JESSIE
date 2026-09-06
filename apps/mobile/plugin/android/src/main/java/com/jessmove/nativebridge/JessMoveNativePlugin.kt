package com.jessmove.nativebridge

import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/**
 * Health Connect, the calendar and activity recognition.
 *
 * NOT COMPILED IN THIS REPOSITORY. There is no Android SDK on the machine
 * this was written on — Java and Gradle are present, the SDK is not — so
 * this file has never been through a compiler. It is conventional
 * platform API use returning the shapes that
 * `packages/shared/src/native.ts` validates and tests, but treat the
 * first Gradle build as the first real check of it.
 *
 * The same two rules as the iOS side. Read only the scopes the platform
 * judges, so a permission sheet never asks for a category this product
 * has no use for. And return times, never titles: `readCalendar` reads
 * three columns from the provider and `CalendarContract.Events.TITLE` is
 * not among them.
 */
@CapacitorPlugin(
    name = "JessMoveNative",
    permissions = [
        // The alias `requestPermissionForAlias("motion", …)` resolves.
        // Without this declaration the request throws at runtime rather
        // than prompting, so motion would be permanently ungranted.
        Permission(
            alias = "motion",
            strings = ["android.permission.ACTIVITY_RECOGNITION"],
        ),
    ],
)
class JessMoveNativePlugin : Plugin() {

    /** Must match NATIVE_BRIDGE_VERSION in packages/shared/src/native.ts. */
    private val bridgeVersion = 1

    /**
     * What a transition is worth.
     *
     * The Transition API exposes no confidence value — unlike
     * `ActivityRecognitionResult`, it emits only once the system has
     * already decided, so there is no number to report. 0.95 rather than
     * 1.0 because a transition is still a classification, and rather than
     * anything lower because `MIN_MOTION_CONFIDENCE` is 0.6 and a value
     * below it would mean this subscription could never say anything at
     * all. It is a constant, not a measurement, and it is written down
     * here so nobody mistakes it for one.
     */
    private val transitionConfidence = 0.95

    private val scope = CoroutineScope(Dispatchers.IO)

    /**
     * Re-subscribe whenever the plugin loads.
     *
     * `requestActivityTransitionUpdates` is idempotent for the same
     * `PendingIntent`, so this costs nothing when a subscription is
     * already live and repairs the case where one was lost — a force-stop,
     * a Play services update, a permission granted from the system
     * settings screen rather than through the app.
     */
    override fun load() {
        if (MotionSubscription.granted(context)) MotionSubscription.register(context)
    }

    private val healthPermissions = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
    )

    private fun healthClient(): HealthConnectClient? =
        if (HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE) {
            HealthConnectClient.getOrCreate(context)
        } else {
            null
        }

    private fun granted(permission: String): Boolean =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    @PluginMethod
    fun capabilities(call: PluginCall) {
        scope.launch {
            val client = healthClient()
            val health = client != null &&
                client.permissionController.getGrantedPermissions().containsAll(healthPermissions)

            val result = JSObject()
            result.put("bridgeVersion", bridgeVersion)
            result.put("platform", "android")
            result.put("health", health)
            result.put("calendar", granted(Manifest.permission.READ_CALENDAR))
            result.put("motion", MotionSubscription.granted(context))
            call.resolve(result)
        }
    }

    @PluginMethod
    fun requestHealthAccess(call: PluginCall) {
        // Health Connect permissions are granted through its own contract,
        // launched from the host Activity. The Activity resolves the call
        // when the sheet closes; this reports the state as it stands.
        scope.launch {
            val client = healthClient()
            val ok = client != null &&
                client.permissionController.getGrantedPermissions().containsAll(healthPermissions)
            call.resolve(JSObject().put("granted", ok))
        }
    }

    @PluginMethod
    fun requestMotionAccess(call: PluginCall) {
        if (MotionSubscription.granted(context)) {
            // Granted already, but not necessarily subscribed — a member
            // who granted the permission in system settings has never been
            // through this path.
            MotionSubscription.register(context)
            call.resolve(JSObject().put("granted", true))
            return
        }
        requestPermissionForAlias("motion", call, "motionPermissionResult")
    }

    /**
     * The other half of `requestPermissionForAlias`.
     *
     * Capacitor resolves nothing on its own: without this the JavaScript
     * promise from `requestMotionAccess` would hang after the member
     * answered the dialogue. Subscribing here rather than at the next
     * `readMotion` matters because the first transition can be minutes
     * away, and the sooner the subscription starts the sooner it arrives.
     */
    @PermissionCallback
    private fun motionPermissionResult(call: PluginCall) {
        val ok = MotionSubscription.granted(context)
        if (ok) MotionSubscription.register(context)
        call.resolve(JSObject().put("granted", ok))
    }

    @PluginMethod
    fun readMotion(call: PluginCall) {
        /*
         * Android has no "what is happening right now" call. The OS
         * delivers transitions to `ActivityTransitionReceiver`, which holds
         * the last arrival; this reads it.
         *
         * `observedAt` is now, and that is not a fudge. The shell's grounds
         * for believing this are current: the platform undertakes to report
         * the next change, so silence since the last one *is* the evidence.
         * `continuingSince` carries when the state began, and the web side
         * judges it against `MAX_CONTINUING_STATE_MINUTES` — six hours,
         * after which an unchanged state is treated as a missed transition
         * rather than a fact. That ceiling lives in the shared package
         * because that is the half of this that a test can reach.
         *
         * Null whenever the permission is not currently held, whatever the
         * store contains. A member who revoked it has withdrawn the
         * grounds, not merely the future updates.
         */
        if (!MotionSubscription.granted(context)) {
            call.resolve(JSObject().put("motion", JSObject.NULL))
            return
        }

        val held = MotionStore.current(context)
        if (held == null) {
            // Subscribed, but nothing has happened yet. `unknown`, which is
            // what the browser has always said.
            call.resolve(JSObject().put("motion", JSObject.NULL))
            return
        }

        val motion = JSObject()
        motion.put("activity", held.activity)
        motion.put("confidence", transitionConfidence)
        motion.put("observedAt", Instant.now().toString())
        motion.put("continuingSince", held.enteredAt.toString())
        call.resolve(JSObject().put("motion", motion))
    }

    @PluginMethod
    fun readCalendar(call: PluginCall) {
        val horizonDays = call.getInt("horizonDays") ?: 14
        if (!granted(Manifest.permission.READ_CALENDAR)) {
            call.resolve(JSObject().put("events", JSArray()))
            return
        }

        val from = System.currentTimeMillis()
        val to = from + horizonDays * 24L * 60 * 60 * 1000

        // Four columns. TITLE, EVENT_LOCATION and DESCRIPTION are not
        // among them, so there is no cursor position that could hold one.
        val projection = arrayOf(
            android.provider.CalendarContract.Events.DTSTART,
            android.provider.CalendarContract.Events.DTEND,
            android.provider.CalendarContract.Events.ALL_DAY,
            android.provider.CalendarContract.Events.AVAILABILITY,
        )

        val events = JSArray()
        context.contentResolver.query(
            android.provider.CalendarContract.Events.CONTENT_URI,
            projection,
            "${android.provider.CalendarContract.Events.DTSTART} >= ? AND " +
                "${android.provider.CalendarContract.Events.DTSTART} <= ? AND " +
                "${android.provider.CalendarContract.Events.DELETED} = 0",
            arrayOf(from.toString(), to.toString()),
            null,
        )?.use { cursor ->
            while (cursor.moveToNext()) {
                val start = cursor.getLong(0)
                val end = cursor.getLong(1)
                if (end <= start) continue
                val event = JSObject()
                event.put("startsAt", Instant.ofEpochMilli(start).toString())
                event.put("endsAt", Instant.ofEpochMilli(end).toString())
                event.put("allDay", cursor.getInt(2) == 1)
                event.put(
                    "transparent",
                    cursor.getInt(3) == android.provider.CalendarContract.Events.AVAILABILITY_FREE,
                )
                events.put(event)
            }
        }

        call.resolve(JSObject().put("events", events))
    }

    @PluginMethod
    fun readHealth(call: PluginCall) {
        scope.launch {
            val client = healthClient()
            val readings = JSArray()

            if (client == null) {
                call.resolve(JSObject().put("readings", readings))
                return@launch
            }

            fun reading(scopeName: String, value: Double, at: Instant) {
                val row = JSObject()
                row.put("scope", scopeName)
                row.put("value", value)
                row.put("recordedAt", at.toString())
                readings.put(row)
            }

            val startOfDay = LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant()
            val now = Instant.now()

            try {
                val steps = client.aggregate(
                    AggregateRequest(
                        metrics = setOf(StepsRecord.COUNT_TOTAL),
                        timeRangeFilter = TimeRangeFilter.between(startOfDay, now),
                    ),
                )
                steps[StepsRecord.COUNT_TOTAL]?.let { reading("steps", it.toDouble(), now) }
            } catch (_: Exception) {
                // A scope the member has since revoked is not an error
                // worth failing the whole read for; the others still go.
            }

            try {
                val since = now.minus(36, ChronoUnit.HOURS)
                val sleep = client.readRecords(
                    ReadRecordsRequest(
                        recordType = SleepSessionRecord::class,
                        timeRangeFilter = TimeRangeFilter.between(since, now),
                    ),
                ).records
                val hours = sleep.sumOf {
                    ChronoUnit.MINUTES.between(it.startTime, it.endTime).toDouble()
                } / 60.0
                if (hours > 0) reading("sleep", hours, sleep.last().endTime)
            } catch (_: Exception) {
            }

            try {
                val since = now.minus(36, ChronoUnit.HOURS)
                val beats = client.readRecords(
                    ReadRecordsRequest(
                        recordType = HeartRateRecord::class,
                        timeRangeFilter = TimeRangeFilter.between(since, now),
                    ),
                ).records.flatMap { it.samples }
                if (beats.isNotEmpty()) {
                    // A trend, not a live series. `heart_rate_trend` is the
                    // scope the platform judges; beat-to-beat data is not
                    // requested and is not sent.
                    val mean = beats.map { it.beatsPerMinute.toDouble() }.average()
                    reading("heart_rate_trend", mean, beats.last().time)
                }
            } catch (_: Exception) {
            }

            call.resolve(JSObject().put("readings", readings))
        }
    }
}
