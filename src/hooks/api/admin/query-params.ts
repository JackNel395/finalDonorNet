/**
 * Filters → query string for the console's paginated lists.
 *
 * It lives beside the admin hooks rather than in `src/lib` for the same reason
 * those hooks are kept out of the `src/hooks/api` barrel: nothing a donor
 * screen imports should reach the console's code.
 */

/** Omits anything the operator hasn't set, so an unset filter is absent rather than empty. */
export function toSearchParams<T extends object>(filters: T): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}
