import { and, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import { beats, producers, type Beat, type BeatWithProducer, type Producer } from "../shared/schema";
import { db } from "../private-app/db";

interface BeatQueryParams {
  q?: string;
  genre?: string;
  minBpm?: number;
  maxBpm?: number;
  key?: string;
  mood?: string;
  minPrice?: number;
  maxPrice?: number;
  producerId?: string;
  featured?: boolean;
  limit?: number;
  offset?: number;
}

export class CatalogStorageSnippet {
  private mapBeatForClient<T extends Beat>(beat: T): T {
    return {
      ...beat,
      audioFileUrl: `/api/preview/${beat.id}`,
      artworkUrl: beat.artworkUrl ? `/api/artwork/${beat.id}` : beat.artworkUrl,
    };
  }

  private mapBeatWithProducerForClient(beat: Beat, producer: Producer): BeatWithProducer {
    return {
      ...this.mapBeatForClient(beat),
      producer,
    };
  }

  async getBeats(params: BeatQueryParams): Promise<{ beats: BeatWithProducer[]; totalCount: number }> {
    const conditions = [eq(beats.active, true)];

    if (params.q) {
      const pattern = `%${params.q}%`;
      conditions.push(
        or(
          sql`${beats.title} ILIKE ${pattern}`,
          sql`${beats.tags}::text ILIKE ${pattern}`,
          sql`${producers.name} ILIKE ${pattern}`,
        )!,
      );
    }

    if (params.genre) {
      const genrePattern = `%${params.genre}%`;
      conditions.push(
        or(
          eq(beats.genre, params.genre),
          sql`${beats.tags}::text ILIKE ${genrePattern}`,
        )!,
      );
    }

    if (params.minBpm) conditions.push(gte(beats.bpm, params.minBpm));
    if (params.maxBpm) conditions.push(lte(beats.bpm, params.maxBpm));
    if (params.key) conditions.push(eq(beats.key, params.key));

    if (params.mood) {
      const moodPattern = `%${params.mood}%`;
      conditions.push(
        or(
          eq(beats.mood, params.mood),
          sql`${beats.tags}::text ILIKE ${moodPattern}`,
        )!,
      );
    }

    if (params.minPrice) conditions.push(gte(sql`CAST(${beats.standardPrice} AS DECIMAL)`, params.minPrice));
    if (params.maxPrice) conditions.push(lte(sql`CAST(${beats.standardPrice} AS DECIMAL)`, params.maxPrice));
    if (params.producerId) conditions.push(eq(beats.producerId, params.producerId));
    if (params.featured !== undefined) conditions.push(eq(beats.featured, params.featured));

    const whereClause = and(...conditions);

    const [countResult, result] = await Promise.all([
      db.select({ count: sql<number>`count(*)` })
        .from(beats)
        .where(whereClause),
      db.select()
        .from(beats)
        .leftJoin(producers, eq(beats.producerId, producers.id))
        .where(whereClause)
        .orderBy(desc(beats.createdAt), desc(beats.id))
        .limit(params.limit || 20)
        .offset(params.offset || 0),
    ]);

    return {
      beats: result.map((row) => this.mapBeatWithProducerForClient(row.beats, row.producers!)),
      totalCount: Number(countResult[0]?.count ?? 0),
    };
  }
}
