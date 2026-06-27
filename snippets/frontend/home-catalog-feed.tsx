import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { BeatWithProducer } from "../shared/schema";

function mergeUniqueBeats(existing: BeatWithProducer[], incoming: BeatWithProducer[]) {
  const uniqueBeats = new Map<string, BeatWithProducer>();

  for (const beat of existing) {
    uniqueBeats.set(beat.id, beat);
  }

  for (const beat of incoming) {
    uniqueBeats.set(beat.id, beat);
  }

  return Array.from(uniqueBeats.values());
}

export function HomeCatalogFeed() {
  const [searchQuery, setSearchQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [allBeats, setAllBeats] = useState<BeatWithProducer[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  const { data: beatsResponse, isLoading } = useQuery<{ beats: BeatWithProducer[]; totalCount: number }>({
    queryKey: ["/api/beats", searchQuery, offset],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append("q", searchQuery);
      params.append("limit", "15");
      params.append("offset", offset.toString());

      const response = await fetch(`/api/beats?${params}`);
      if (!response.ok) throw new Error("Failed to fetch beats");
      return response.json();
    },
  });

  const beats = beatsResponse?.beats ?? [];

  useEffect(() => {
    if (beatsResponse) {
      setTotalCount(beatsResponse.totalCount);
    }

    if (beats.length > 0) {
      if (offset === 0) {
        setAllBeats(mergeUniqueBeats([], beats));
      } else {
        setAllBeats((prev) => mergeUniqueBeats(prev, beats));
      }
      setHasMore(offset + beats.length < (beatsResponse?.totalCount ?? 0));
    } else if (offset === 0) {
      setAllBeats([]);
      setHasMore(false);
    }
  }, [beats, beatsResponse, offset]);

  useEffect(() => {
    setOffset(0);
  }, [searchQuery]);

  const handleLoadMore = () => {
    if (!isLoading && hasMore) {
      setOffset((prev) => prev + 15);
    }
  };

  return (
    <section>
      <input
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="Search beats"
      />

      <div>Loaded {allBeats.length} of {totalCount}</div>

      <button onClick={handleLoadMore} disabled={isLoading || !hasMore}>
        {hasMore ? "Load More Beats" : "No More Beats"}
      </button>
    </section>
  );
}
