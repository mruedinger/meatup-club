const APP_PHOTO_PATH = "/api/places/photo";
const PRODUCTION_HOSTS = new Set(["meatup.club", "www.meatup.club"]);

export function normalizeRestaurantPhotoUrl(
  photoUrl: string | null,
  requestUrl?: string
): string | null {
  if (!photoUrl) {
    return photoUrl;
  }

  if (photoUrl.startsWith(`${APP_PHOTO_PATH}?`) || photoUrl === APP_PHOTO_PATH) {
    return photoUrl;
  }

  try {
    const parsed = new URL(photoUrl);
    const currentOrigin = requestUrl ? new URL(requestUrl).origin : null;

    if (parsed.pathname === APP_PHOTO_PATH && parsed.searchParams.has("name")) {
      if (
        PRODUCTION_HOSTS.has(parsed.hostname) ||
        (currentOrigin !== null && parsed.origin === currentOrigin)
      ) {
        return `${APP_PHOTO_PATH}?${parsed.searchParams.toString()}`;
      }

      return photoUrl;
    }

    if (parsed.hostname !== "places.googleapis.com") {
      return photoUrl;
    }

    if (!parsed.pathname.startsWith("/v1/") || !parsed.pathname.endsWith("/media")) {
      return photoUrl;
    }

    const name = parsed.pathname.replace(/^\/v1\//, "").replace(/\/media$/, "");
    const maxHeightPx = parsed.searchParams.get("maxHeightPx") || "400";
    const maxWidthPx = parsed.searchParams.get("maxWidthPx") || "400";

    return `${APP_PHOTO_PATH}?${new URLSearchParams({
      name,
      maxHeightPx,
      maxWidthPx,
    }).toString()}`;
  } catch {
    return photoUrl;
  }
}
