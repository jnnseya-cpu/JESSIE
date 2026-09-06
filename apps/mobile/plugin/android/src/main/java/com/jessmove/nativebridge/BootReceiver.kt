package com.jessmove.nativebridge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * A restart ends the subscription and invalidates everything stored.
 *
 * NOT COMPILED IN THIS REPOSITORY — see the note on `JessMoveNativePlugin`.
 *
 * Two separate things go wrong across a reboot, and both are silent:
 *
 * **The subscription is gone.** Transition updates are held by Play
 * services against a live `PendingIntent` and do not survive a restart. If
 * nothing re-registers, motion stays at whatever it was when the phone
 * went down, forever, and the shell keeps answering with it.
 *
 * **What was stored is no longer known.** A phone can be off for a minute
 * or a fortnight, and no transition was recorded while it was. The state
 * is cleared rather than aged out, because "we have no idea" is a
 * different statement from "this is old", and only the first one is true
 * here.
 *
 * Clearing first, registering second: if registration fails there is no
 * stale belief left behind to be read as current.
 */
internal class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            -> {
                MotionStore.clear(context)
                MotionSubscription.register(context)
            }
        }
    }
}
