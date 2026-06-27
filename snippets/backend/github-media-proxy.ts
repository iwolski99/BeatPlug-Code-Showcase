import type { Response as ExpressResponse } from "express";
import { Readable } from "node:stream";

export interface ResolvedMediaAsset {
  repoPath: string;
  fileFormat: "mp3" | "wav";
  contentType: string;
}

export interface MediaResolutionDebugResult {
  repository: string;
  normalizedPath: string;
  candidates: Array<{
    path: string;
    exists: boolean;
  }>;
  matchedPath: string | null;
}

export class ObjectNotFoundError extends Error {
  constructor(message = "Object not found") {
    super(message);
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

function uniqueValues(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim().replace(/^\/+/, "").replace(/\/+/g, "/"))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function getBaseName(filePath: string): string {
  const fileName = filePath.split("/").pop() || filePath;
  return fileName.replace(/\.[^.]+$/, "");
}

function toTitleCase(value: string): string {
  return value.replace(/\b([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function getBaseNameVariants(baseName: string): string[] {
  const trimmed = baseName.trim();
  const withoutProducerPrefix = trimmed.replace(/^[^-]+-\s*/i, "");
  const titleCased = toTitleCase(trimmed);
  const strippedTitleCased = toTitleCase(withoutProducerPrefix);

  return uniqueValues([
    trimmed,
    titleCased,
    withoutProducerPrefix,
    strippedTitleCased,
  ]);
}

export class ObjectStorageService {
  private readonly githubToken: string;
  private readonly repoOwner: string;
  private readonly repoName: string;

  constructor() {
    this.githubToken = process.env.GITHUB_STORAGE_TOKEN || "";
    this.repoOwner = process.env.GITHUB_REPO_OWNER || "";
    this.repoName = process.env.GITHUB_REPO_NAME || "";

    if (!this.githubToken || !this.repoOwner || !this.repoName) {
      throw new Error(
        "GitHub storage is not configured. Set GITHUB_STORAGE_TOKEN, GITHUB_REPO_OWNER, and GITHUB_REPO_NAME.",
      );
    }
  }

  getRepositoryLabel(): string {
    return `${this.repoOwner}/${this.repoName}`;
  }

  normalizeStoragePath(rawPath: string): string {
    if (!rawPath) {
      return "";
    }

    let normalizedPath = rawPath.trim();
    const isUrlPath = /^https?:\/\//i.test(normalizedPath);

    if (isUrlPath) {
      normalizedPath = new URL(normalizedPath).pathname;
    }

    normalizedPath = decodeURIComponent(normalizedPath)
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");

    if (isUrlPath) {
      normalizedPath = normalizedPath
        .replace(/\?.*$/, "")
        .replace(/#.*$/, "");
    }

    normalizedPath = normalizedPath.replace(/^replit-objstore-[^/]+\//, "");
    normalizedPath = normalizedPath.replace(/^\.private\//, "");
    normalizedPath = normalizedPath.replace(/^public\//, "");

    if (normalizedPath.startsWith("uploads/licenses/")) {
      normalizedPath = normalizedPath.replace(/^uploads\/licenses\//, "licenses/");
    }

    if (normalizedPath.startsWith("uploads/beat card images/")) {
      normalizedPath = normalizedPath.replace(/^uploads\/beat card images\//, "beat card images/");
    }

    if (normalizedPath.startsWith("objects/uploads/")) {
      normalizedPath = normalizedPath.replace(/^objects\/uploads\//, "");
    }

    if (normalizedPath.startsWith("objects/")) {
      normalizedPath = normalizedPath.replace(/^objects\//, "");
    }

    return normalizedPath;
  }

  private getDirectRepositoryCandidates(rawPath: string): string[] {
    if (!rawPath) {
      return [];
    }

    let candidatePath = rawPath.trim();
    const isUrlPath = /^https?:\/\//i.test(candidatePath);

    if (isUrlPath) {
      candidatePath = new URL(candidatePath).pathname;
    }

    candidatePath = decodeURIComponent(candidatePath)
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");

    if (isUrlPath) {
      candidatePath = candidatePath
        .replace(/\?.*$/, "")
        .replace(/#.*$/, "");
    }

    return uniqueValues([
      candidatePath,
      candidatePath.replace(/^\.private\//, ""),
      candidatePath.replace(/^replit-objstore-[^/]+\//, ""),
      candidatePath.replace(/^replit-objstore-[^/]+\/public\//, ""),
    ]);
  }

  private buildPreviewCandidates(rawPath: string): string[] {
    const directCandidates = this.getDirectRepositoryCandidates(rawPath);
    const normalized = this.normalizeStoragePath(rawPath);
    const baseNames = getBaseNameVariants(getBaseName(normalized));

    return uniqueValues([
      ...directCandidates,
      normalized,
      ...baseNames.flatMap((baseName) => [
        `previews/${baseName}.mp3`,
        `audio/previews/${baseName}.mp3`,
        `media/previews/${baseName}.mp3`,
        `uploads/previews/${baseName}.mp3`,
        `uploads/licenses/standard/${baseName}.mp3`,
        `.private/uploads/licenses/standard/${baseName}.mp3`,
        `audio/${baseName}.mp3`,
        `uploads/${baseName}.mp3`,
        `licenses/standard/${baseName}.mp3`,
        `${baseName}.mp3`,
      ]),
    ]);
  }

  async resolvePreviewAsset(audioFileUrl: string): Promise<ResolvedMediaAsset> {
    const repoPath = await this.resolveFirstExistingPath(this.buildPreviewCandidates(audioFileUrl));
    return {
      repoPath,
      fileFormat: "mp3",
      contentType: "audio/mpeg",
    };
  }

  async debugResolvePreviewAsset(audioFileUrl: string): Promise<MediaResolutionDebugResult> {
    const candidates = this.buildPreviewCandidates(audioFileUrl);
    const candidateResults: MediaResolutionDebugResult["candidates"] = [];
    let matchedPath: string | null = null;

    for (const candidate of candidates) {
      const metadata = await this.getOptionalMetadata(candidate);
      const exists = Boolean(metadata);
      candidateResults.push({ path: candidate, exists });

      if (!matchedPath && exists) {
        matchedPath = candidate;
      }
    }

    return {
      repository: this.getRepositoryLabel(),
      normalizedPath: this.normalizeStoragePath(audioFileUrl),
      candidates: candidateResults,
      matchedPath,
    };
  }

  async streamRepositoryPath(
    repoPath: string,
    res: ExpressResponse,
    options?: {
      cacheTtlSec?: number;
      contentType?: string;
      contentDisposition?: string;
      cacheScope?: "public" | "private";
    },
  ): Promise<void> {
    const rawResponse = await this.fetchRawResponse(repoPath, res.req.headers.range as string | undefined);

    if (!rawResponse || !rawResponse.body) {
      throw new ObjectNotFoundError();
    }

    const cacheScope = options?.cacheScope || "public";
    const contentType = options?.contentType || rawResponse.headers.get("content-type") || "application/octet-stream";

    res.status(rawResponse.status);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", `${cacheScope}, max-age=${options?.cacheTtlSec ?? 3600}`);
    res.setHeader("Accept-Ranges", "bytes");
    res.flushHeaders();

    Readable.fromWeb(rawResponse.body as any).pipe(res);
  }

  private async resolveFirstExistingPath(candidates: string[]): Promise<string> {
    for (const candidate of uniqueValues(candidates)) {
      const metadata = await this.getOptionalMetadata(candidate);
      if (metadata) {
        return candidate;
      }
    }

    throw new ObjectNotFoundError();
  }

  // The private repository fetch helpers are omitted in this public showcase file,
  // but the candidate-path resolution logic is unchanged from production.
  private async fetchRawResponse(_repoPath: string, _range?: string): Promise<Response> {
    throw new Error("Implementation omitted from public showcase");
  }

  private async getOptionalMetadata(_repoPath: string): Promise<Record<string, unknown> | null> {
    throw new Error("Implementation omitted from public showcase");
  }
}
