/**
 * Native stub for the operations console. The console is web-only, and route
 * files under src/app must have a non-platform base file to stay universal for
 * deep linking (https://docs.expo.dev/router/advanced/platform-specific-modules/),
 * so the platform split lives here instead — outside src/app, where the rule
 * does not apply. Because of this file the native bundle never resolves
 * ./console, and no admin screen, hook, or table reaches a phone.
 */
export function AdminConsole() {
  return null;
}
