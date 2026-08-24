/**
 * Haptic feedback, where the platform allows it (ADR 0002).
 *
 * Android's Chromium webview exposes navigator.vibrate; iOS WebKit does not
 * implement it and Obsidian documents no native bridge, so there we probe an
 * undocumented Capacitor Haptics plugin as a best effort and otherwise stay
 * silent. Desktop has neither: every call is a clean no-op.
 */

type Vibrate = (pattern: number | number[]) => boolean;

/** Drag lifecycle pulses, in milliseconds. */
export const HAPTIC_DRAG_START_MS = 10;
export const HAPTIC_TARGET_CHANGE_MS = 6;
export const HAPTIC_DROP_MS = 20;

function capacitorVibrate(): Vibrate | undefined {
	const plugins = (
		globalThis as {
			Capacitor?: { Plugins?: { Haptics?: { vibrate(options: { duration: number }): Promise<unknown> } } };
		}
	).Capacitor?.Plugins;
	const haptics = plugins?.Haptics;
	if (!haptics) return undefined;
	return (pattern) => {
		void haptics.vibrate({ duration: Array.isArray(pattern) ? pattern[0] : pattern });
		return true;
	};
}

function detectVibrate(): Vibrate | undefined {
	if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
		return (pattern) => navigator.vibrate(pattern);
	}
	try {
		return capacitorVibrate();
	} catch {
		return undefined;
	}
}

/** Fire one haptic pulse; returns false when the platform cannot vibrate. */
export function pulse(
	pattern: number | number[],
	vibrate: Vibrate | undefined = detectVibrate(),
): boolean {
	if (!vibrate) return false;
	try {
		return vibrate(pattern) === true;
	} catch {
		return false;
	}
}
