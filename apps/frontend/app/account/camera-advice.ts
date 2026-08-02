/**
 * What to tell somebody whose camera this app cannot open.
 *
 * This was wrong, and wrong in the worst way: it named a screen that does
 * not exist. The advice said to long-press the JESS MOVE icon, open App
 * info, then Permissions, then Camera. On Android an installed web app is
 * a thin wrapper around the browser and borrows the browser's permission,
 * so its own App info frequently has no Camera entry at all. Somebody
 * following that instruction arrives at an empty list and concludes the
 * app is broken — which, from where they are standing, it is.
 *
 * Two rules here, both learned the hard way. Name the place the setting
 * actually lives, per platform. And in the same breath, point at the way
 * that needs no permission at all, because that is the answer for almost
 * everybody: photographing the barcode opens the system camera app and
 * reads the same packet.
 */

export interface Device {
  /** Running as an installed app rather than a browser tab. */
  installed: boolean;
  userAgent: string;
}

export function deviceFrom(win: Window | undefined = typeof window === 'undefined' ? undefined : window): Device {
  if (!win) return { installed: false, userAgent: '' };
  const installed =
    win.matchMedia?.('(display-mode: standalone)').matches === true ||
    (win.navigator as { standalone?: boolean }).standalone === true;
  return { installed, userAgent: win.navigator.userAgent ?? '' };
}

export function isAndroid(ua: string): boolean {
  return /Android/i.test(ua);
}

export function isIos(ua: string): boolean {
  return /iPad|iPhone|iPod/i.test(ua);
}

/** Where the camera permission for this device actually lives. */
export function permissionRoute(device: Device): string {
  const { installed, userAgent } = device;

  if (installed && isAndroid(userAgent)) {
    // The important correction: an installed web app on Android has no
    // camera setting of its own, so App info is the wrong place to look.
    return (
      'On Android an installed web app borrows the browser’s permission and has no camera ' +
      'setting of its own, which is why the app’s own settings screen shows none. It lives ' +
      'in Chrome: the ⋮ menu → Settings → Site settings → Camera → jessmove.com → Allow.'
    );
  }
  if (installed && isIos(userAgent)) {
    return 'On iPhone: Settings → JESS MOVE → Camera, and turn it on.';
  }
  if (isAndroid(userAgent) || isIos(userAgent)) {
    return 'Tap the icon just left of the web address → Permissions → Camera → Allow.';
  }
  return 'Allow the camera for this site in your browser’s address-bar settings.';
}

/**
 * The message, which leads with the answer rather than the obstacle.
 *
 * The version this replaces opened with a sentence about permissions and
 * then spent three more on a Chrome menu. Nobody standing in an aisle
 * wants a tutorial; they want the packet scanned. So the first thing said
 * is the thing that works, and the menu route is one quiet sentence at the
 * end for the few who would rather have live scanning back.
 */
export function cameraBlockedMessage(device: Device): string {
  return (
    'Photograph a barcode above uses your phone’s own camera and reads the same packets, with ' +
    'no permission needed. Add several at once takes a whole trolley in one go. If you would ' +
    `rather have live scanning back: ${lowerFirst(permissionRoute(device))}`
  );
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
