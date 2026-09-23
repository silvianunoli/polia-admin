import { useQuery } from "@tanstack/react-query";
import {
  fetchBrands,
  fetchPosts,
  fetchCalendarEntries,
  fetchInspirationSources,
  fetchInspirations,
  fetchCreditTransactions,
  fetchAccountSnapshots,
  fetchPostMetrics,
  fetchBrandTemplates,
} from "./api";

export function useBrands() {
  return useQuery({ queryKey: ["brands"], queryFn: fetchBrands });
}

export function usePosts(brandId: string) {
  return useQuery({
    queryKey: ["posts", brandId],
    queryFn: () => fetchPosts(brandId),
    enabled: !!brandId,
  });
}

export function useCalendarEntries(brandId: string) {
  return useQuery({
    queryKey: ["calendar", brandId],
    queryFn: () => fetchCalendarEntries(brandId),
    enabled: !!brandId,
  });
}

export function useInspirationSources(brandId: string) {
  return useQuery({
    queryKey: ["inspiration-sources", brandId],
    queryFn: () => fetchInspirationSources(brandId),
    enabled: !!brandId,
  });
}

export function useInspirations(brandId: string) {
  return useQuery({
    queryKey: ["inspirations", brandId],
    queryFn: () => fetchInspirations(brandId),
    enabled: !!brandId,
  });
}

export function useCreditTransactions() {
  return useQuery({ queryKey: ["credit-transactions"], queryFn: fetchCreditTransactions });
}

export function useAccountSnapshots(brandId: string) {
  return useQuery({
    queryKey: ["account-snapshots", brandId],
    queryFn: () => fetchAccountSnapshots(brandId),
    enabled: !!brandId,
  });
}

export function usePostMetrics(brandId: string) {
  return useQuery({
    queryKey: ["post-metrics", brandId],
    queryFn: () => fetchPostMetrics(brandId),
    enabled: !!brandId,
  });
}

export function useBrandTemplates(brandId: string) {
  return useQuery({
    queryKey: ["brand-templates", brandId],
    queryFn: () => fetchBrandTemplates(brandId),
    enabled: !!brandId,
  });
}
