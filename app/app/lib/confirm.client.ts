/**
 * Shared confirmation helper for destructive actions.
 * Keeps browser confirm usage centralized across routes/components.
 */
export function confirmAction(message: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.confirm(message);
}
