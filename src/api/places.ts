import { apiClient } from "@/lib/api-client";

export interface Category {
  id: string;
  label: string;
  keyword: string;
  types: string[];
  group?: string;
}

export interface PlacePreview {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  category?: string;
  staging: boolean;
  sourceUrl?: string;
  attribution?: string;
}

export interface PlacesSearchResult {
  places: PlacePreview[];
  nextPageToken: string | null;
  totalEstimate: number | null;
  staging: boolean;
}

export interface PlacesSearchParams {
  region:
    | { type: "city"; query: string }
    | { type: "radius"; center: { lat: number; lng: number }; radiusMeters: number };
  categories: string[];
  pageToken?: string;
  limit?: number;
}

export const placesApi = {
  /** Check the configured free business data source. */
  status: () => apiClient.get<{ staging: boolean; hasApiKey: boolean; available: boolean; source: string; message: string }>("/places/status"),

  /** Cached list of all available lead categories. */
  categories: () => apiClient.get<{ categories: Category[] }>("/places/categories"),

  /** Preview search — shows pins before committing to a full extraction job. */
  search: (params: PlacesSearchParams) =>
    apiClient.post<PlacesSearchResult>("/places/search", params),
};
