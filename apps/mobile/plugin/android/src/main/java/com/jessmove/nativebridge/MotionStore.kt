package com.jessmove.nativebridge

import android.content.Context
import java.time.Instant

/**
 * The one activity state the shell currently believes, and when it began.
 *
 * NOT COMPILED IN THIS REPOSITORY — see the note on `JessMoveNativePlugin`.
 *
 * Android's Activity Recognition Transition API is a subscription, not a
 * question: the OS delivers "they started sitting still" to a
 * `PendingIntent` and then says nothing at all until that changes. So
 * something has to hold the last thing it said, and that something has to
 * survive the webview being destroyed, the process being killed and the
 * app being reopened — which is why this is `SharedPreferences` and not a
 * field.
 *
 * Two fields, and neither is a guess:
 *
 *   - `activity`, in the shared vocabulary that
 *     `packages/shared/src/native.ts` maps, never the raw `DetectedActivity`
 *     integer. The mapping happens once, here, at the moment the platform
 *     value arrives.
 *   - `enteredAt`, wall-clock epoch millis, which the web side reads as
 *     `continuingSince` and judges against `MAX_CONTINUING_STATE_MINUTES`.
 *
 * There is deliberately no "confidence" column. The Transition API emits
 * only when the system has already decided, and exposes no number — so
 * inventing a per-event one here would be inventing data. The single
 * constant lives in the plugin, next to the comment explaining it.
 *
 * Absence is a real state and means exactly one thing: *this shell does
 * not know*. `readMotion` then returns null and `toMotionState` returns
 * `unknown`, which is what the browser has always returned. Nothing about
 * an empty store is an error to be recovered from.
 */
internal object MotionStore {

    private const val FILE = "com.jessmove.nativebridge.motion"
    private const val KEY_ACTIVITY = "activity"
    private const val KEY_ENTERED_AT = "enteredAt"

    /** A state the shell is currently holding. */
    internal data class Held(val activity: String, val enteredAt: Instant)

    private fun prefs(context: Context) =
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun current(context: Context): Held? {
        val store = prefs(context)
        val activity = store.getString(KEY_ACTIVITY, null) ?: return null
        val enteredAt = store.getLong(KEY_ENTERED_AT, 0L)
        if (enteredAt <= 0L) return null
        return Held(activity, Instant.ofEpochMilli(enteredAt))
    }

    fun record(context: Context, activity: String, enteredAt: Instant) {
        prefs(context).edit()
            .putString(KEY_ACTIVITY, activity)
            .putLong(KEY_ENTERED_AT, enteredAt.toEpochMilli())
            .apply()
    }

    /**
     * Forget the current state.
     *
     * Called on an EXIT with no matching ENTER, and on boot. Both are the
     * same situation: something ended and nothing has said what replaced
     * it. Keeping the old value would be the shell asserting `still` about
     * somebody who has just stood up.
     */
    fun clear(context: Context) {
        prefs(context).edit().remove(KEY_ACTIVITY).remove(KEY_ENTERED_AT).apply()
    }
}
