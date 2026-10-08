/**
 * /admin — the console's front door. A pure redirect to the overview.
 *
 * It pointed at /admin/requests for as long as no overview existed, which meant
 * an operator opening the console landed on row one of a table with no sense of
 * whether anything needed them. The overview answers that first, and the
 * requests table is one click away in the sidebar.
 *
 * Web-only; see console.native.tsx for the stub that keeps the console out of
 * the native bundle.
 */
import { Redirect } from 'expo-router';

export function AdminConsole() {
  return <Redirect href="/admin/overview" />;
}
