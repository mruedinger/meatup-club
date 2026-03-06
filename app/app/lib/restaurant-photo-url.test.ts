import { describe, expect, it } from "vitest";
import { normalizeRestaurantPhotoUrl } from "./restaurant-photo-url";

describe("normalizeRestaurantPhotoUrl", () => {
  it("rewrites legacy Google Places media URLs to the app photo proxy", () => {
    expect(
      normalizeRestaurantPhotoUrl(
        "https://places.googleapis.com/v1/places/abc123/photos/photo-1/media?maxHeightPx=320&maxWidthPx=640&key=test-key"
      )
    ).toBe(
      "/api/places/photo?name=places%2Fabc123%2Fphotos%2Fphoto-1&maxHeightPx=320&maxWidthPx=640"
    );
  });

  it("collapses absolute app photo URLs back to the local proxy path", () => {
    expect(
      normalizeRestaurantPhotoUrl(
        "https://meatup.club/api/places/photo?name=places%2Fabc123%2Fphotos%2Fphoto-1&maxHeightPx=400&maxWidthPx=400",
        "http://localhost:5173/dashboard/polls"
      )
    ).toBe(
      "/api/places/photo?name=places%2Fabc123%2Fphotos%2Fphoto-1&maxHeightPx=400&maxWidthPx=400"
    );
  });

  it("leaves unrelated external image URLs unchanged", () => {
    expect(
      normalizeRestaurantPhotoUrl(
        "https://images.example.com/prime.jpg",
        "http://localhost:5173/dashboard/polls"
      )
    ).toBe("https://images.example.com/prime.jpg");
  });
});
