package com.jessmove.nativebridge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionResult
import java.time.Instant

/**
 * Where Android delivers the fact that somebody started, or stopped,
 * doing something.
 *
 * NOT COMPILED IN THIS REPOSITORY — see the note on `JessMoveNativePlugin`.
 * The rule this file exists to keep is asserted structurally in
 * `apps/backend/test/native-bridge.test.ts`, because that is the half of
 * it a machine here can check.
 *
 * ## An ENTER is a fact. An EXIT is only the end of one.
 *
 * The Transition API reports both. "Entered IN_VEHICLE" says what somebody
 * is doing. "Exited IN_VEHICLE" says only that they stopped — not whether
 * they are now walking, standing at a bus stop or sitting in a different
 * car. So an ENTER is stored and an EXIT clears, and the cleared state is
 * `unknown` until an arrival somewhere else says otherwise.
 *
 * Getting that backwards would be the failure the shared contract cannot
 * catch: the shell would assert `still` about somebody who has just stood
 * up and started walking to their car, and the product's entire claim is
 * that it knows when not to interrupt.
 *
 * ## Elapsed-realtime nanoseconds are not a clock
 *
 * `ActivityTransitionEvent` timestamps events with
 * `elapsedRealTimeNanos` — nanoseconds since boot, which is monotonic and
 * survives sleep but means nothing to anything outside this device. The
 * web side compares `continuingSince` against wall clock, so it is
 * converted here, once, at the only point where both clocks can be read in
 * the same instant.
 */
internal class ActivityTransitionReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION = "com.jessmove.nativebridge.ACTIVITY_TRANSITION"
    }

    override fun onReceive(context: Context, intent: Intent) {
        /*
         * A revoked permission is not a state change to record — it is the
         * end of any grounds to believe anything. Clear and stop.
         */
        if (!MotionSubscription.granted(context)) {
            MotionStore.clear(context)
            return
        }

        if (!ActivityTransitionResult.hasResult(intent)) return
        val result = ActivityTransitionResult.extractResult(intent) ?: return

        // Read the two clocks together. Doing it once per batch rather than
        // once per event keeps every timestamp in the batch on the same
        // basis, which matters when the batch spans a sleep.
        val wallNow = System.currentTimeMillis()
        val bootNow = SystemClock.elapsedRealtimeNanos()

        // Start from what is already believed, so an EXIT arriving in a
        // batch of its own can still clear a state stored an hour ago.
        var held = MotionStore.current(context)

        // `transitionEvents` is ordered oldest first, so replaying the
        // batch in order leaves `held` holding the newest fact.
        for (event in result.transitionEvents) {
            val activity = MotionSubscription.vocabulary(event.activityType) ?: continue
            val at = Instant.ofEpochMilli(wallNow - (bootNow - event.elapsedRealTimeNanos) / 1_000_000)

            when (event.transitionType) {
                ActivityTransition.ACTIVITY_TRANSITION_ENTER ->
                    held = MotionStore.Held(activity, at)

                ActivityTransition.ACTIVITY_TRANSITION_EXIT ->
                    // Only the state being left is forgotten. An EXIT from
                    // something the shell was not holding is stale news
                    // about a state it already replaced.
                    if (held?.activity == activity) held = null
            }
        }

        val current = held
        if (current == null) {
            MotionStore.clear(context)
        } else {
            MotionStore.record(context, current.activity, current.enteredAt)
        }
    }
}
