package com.jessmove.nativebridge

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionRequest
import com.google.android.gms.location.DetectedActivity

/**
 * The subscription itself: which transitions are asked for, and how the
 * OS is told where to deliver them.
 *
 * NOT COMPILED IN THIS REPOSITORY — see the note on `JessMoveNativePlugin`.
 *
 * This is an object rather than plugin methods because two callers need
 * it and only one of them is the plugin. `BootReceiver` has to re-register
 * after a restart — transition subscriptions do not survive one — and it
 * has no Capacitor bridge, no webview and no plugin instance to reach
 * through.
 */
internal object MotionSubscription {

    internal const val PERMISSION = "android.permission.ACTIVITY_RECOGNITION"

    /**
     * Five activities, and the reason for each.
     *
     * `IN_VEHICLE` and `ON_BICYCLE` are the two that make the product
     * behave differently: `ContextService` withholds a prompt from
     * somebody driving or cycling. `STILL`, `WALKING` and `RUNNING` are
     * subscribed to not because anything blocks on them but because
     * without them the shell cannot tell "they stopped driving" from "the
     * subscription broke" — an EXIT from driving with no ENTER after it
     * clears the state, and the clearing is only ever undone by an arrival
     * somewhere else.
     *
     * `ON_FOOT` is deliberately absent: it is a superset of walking and
     * running, so subscribing to it would double every step transition and
     * make the two orderings race.
     */
    private val ACTIVITIES = listOf(
        DetectedActivity.STILL,
        DetectedActivity.WALKING,
        DetectedActivity.RUNNING,
        DetectedActivity.IN_VEHICLE,
        DetectedActivity.ON_BICYCLE,
    )

    /** The shared vocabulary in `packages/shared/src/native.ts`. */
    fun vocabulary(detected: Int): String? = when (detected) {
        DetectedActivity.STILL -> "stationary"
        DetectedActivity.WALKING -> "walking"
        DetectedActivity.RUNNING -> "running"
        DetectedActivity.IN_VEHICLE -> "automotive"
        DetectedActivity.ON_BICYCLE -> "cycling"
        else -> null
    }

    fun granted(context: Context): Boolean =
        ContextCompat.checkSelfPermission(context, PERMISSION) == PackageManager.PERMISSION_GRANTED

    private fun pendingIntent(context: Context): PendingIntent {
        val intent = Intent(context, ActivityTransitionReceiver::class.java)
            .setAction(ActivityTransitionReceiver.ACTION)

        /*
         * FLAG_MUTABLE, and it is not optional.
         *
         * The OS writes the transition result *into* this intent before
         * delivering it. On Android 12 and above an immutable PendingIntent
         * makes that impossible, and the failure is silent: the receiver
         * fires with an intent `extractResult` returns null for, so motion
         * would appear to work and always be `unknown`.
         */
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }

        return PendingIntent.getBroadcast(context, REQUEST_CODE, intent, flags)
    }

    private const val REQUEST_CODE = 4_710

    /**
     * Subscribe, if the member has granted the permission.
     *
     * Returns whether the request was issued, not whether it succeeded —
     * Play services resolves asynchronously and there is nothing useful to
     * do with a failure here. If it fails the store stays empty, `readMotion`
     * returns null, and the product behaves exactly as it does in a
     * browser.
     */
    fun register(context: Context): Boolean {
        if (!granted(context)) return false
        val transitions = ACTIVITIES.flatMap { activity ->
            listOf(
                ActivityTransition.Builder()
                    .setActivityType(activity)
                    .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER)
                    .build(),
                ActivityTransition.Builder()
                    .setActivityType(activity)
                    .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_EXIT)
                    .build(),
            )
        }

        return try {
            ActivityRecognition.getClient(context).requestActivityTransitionUpdates(
                ActivityTransitionRequest(transitions),
                pendingIntent(context),
            )
            true
        } catch (_: SecurityException) {
            // The permission was revoked between the check and the call.
            false
        }
    }

    /**
     * Stop the subscription and forget the state.
     *
     * The order matters: the store is cleared last, so a transition that
     * arrives in the gap is overwritten rather than left behind as the
     * shell's belief about somebody it is no longer watching.
     */
    fun unregister(context: Context) {
        try {
            ActivityRecognition.getClient(context)
                .removeActivityTransitionUpdates(pendingIntent(context))
        } catch (_: SecurityException) {
        }
        MotionStore.clear(context)
    }
}
