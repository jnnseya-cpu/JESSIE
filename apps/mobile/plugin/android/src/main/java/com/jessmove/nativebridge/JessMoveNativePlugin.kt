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
@CapacitorPlugin(name = "JessMoveNative")
class JessMoveNativePlugin : Plugin() {

    /** Must match NATIVE_BRIDGE_VERSION in packages/shared/src/native.ts. */
    private val bridgeVersion = 1

    private val scope = CoroutineScope(Dispatchers.IO)

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
            result.put("motion", granted("android.permission.ACTIVITY_RECOGNITION"))
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
        if (granted("android.permission.ACTIVITY_RECOGNITION")) {
            call.resolve(JSObject().put("granted", true))
            return
        }
        requestPermissionForAlias("motion", call, "motionPermissionResult")
    }

    @PluginMethod
    fun readMotion(call: PluginCall) {
        /*
         * Deliberately null.
         *
         * Android's activity recognition is a subscription: the app
         * registers a PendingIntent and the OS delivers transitions over
         * time. There is no "what is happening right now" call, and the
         * honest answer to a synchronous question is that this shell does
         * not know yet.
         *
         * `toMotionState(null)` is `unknown`, which blocks nothing and
         * asserts nothing — the same answer the browser gives. Returning
         * a stale cached transition instead would be the one thing the
         * shared contract's staleness window exists to prevent. The
         * transition receiver is the next piece of work; until it exists
         * this is the truthful answer rather than a convenient one.
         */
        call.resolve(JSObject().put("motion", JSObject.NULL))
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
