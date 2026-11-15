"use client";
import { useData } from "@/contexts/DataContext";

/**
 * Reads one collection from the shared live store (see DataContext).
 * Returns { data, loading, error }. Data is already sorted: names A→Z for
 * clients/machines/workers/products, newest first for everything dated.
 */
function useCollection(collectionName) {
  const { data, loaded, errors } = useData();
  return {
    data: data[collectionName] ?? [],
    loading: !loaded[collectionName],
    error: errors[collectionName] ?? null,
  };
}

export { useCollection };
