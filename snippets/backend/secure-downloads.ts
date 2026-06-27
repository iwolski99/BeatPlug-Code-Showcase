import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { storage } from "../private-app/storage";
import { ObjectNotFoundError, ObjectStorageService } from "./github-media-proxy";

const JWT_SECRET = process.env.SESSION_SECRET || process.env.DOWNLOAD_TOKEN_SECRET || "<development-only-placeholder>";
const SECRET: string = JWT_SECRET;

export interface DownloadTokenPayload {
  orderId: string;
  beatId: string;
  licenseType: string;
  assetPath: string;
  downloadName: string;
  contentType: string;
  fileFormat: "mp3" | "wav";
  exp: number;
}

interface GenerateTokenInput {
  orderId: string;
  beatId: string;
  licenseType: string;
  assetPath: string;
  downloadName: string;
  contentType: string;
  fileFormat: "mp3" | "wav";
  expiresInSeconds?: number;
}

export class DownloadTokenService {
  static generateToken(input: GenerateTokenInput): string {
    const payload: DownloadTokenPayload = {
      orderId: input.orderId,
      beatId: input.beatId,
      licenseType: input.licenseType,
      assetPath: input.assetPath,
      downloadName: input.downloadName,
      contentType: input.contentType,
      fileFormat: input.fileFormat,
      exp: Math.floor(Date.now() / 1000) + (input.expiresInSeconds ?? 30 * 24 * 60 * 60),
    };

    return jwt.sign(payload, SECRET, { algorithm: "HS256" });
  }

  static verifyToken(token: string): DownloadTokenPayload | null {
    try {
      return jwt.verify(token, SECRET, {
        algorithms: ["HS256"],
      }) as DownloadTokenPayload;
    } catch {
      return null;
    }
  }
}

function getSafeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

async function createSecureDownloadLink(params: {
  orderId: string;
  beatId: string;
  beatTitle: string;
  audioFileUrl: string;
  purchasedLicenseType: string;
  assetLicenseType: string;
  req: Request;
}): Promise<{ url: string; fileFormat: "MP3" | "WAV" }> {
  const objectStorageService = new ObjectStorageService();
  const asset = await objectStorageService.resolveMasterAsset(
    params.audioFileUrl,
    params.assetLicenseType,
    params.beatTitle,
  );

  const token = DownloadTokenService.generateToken({
    orderId: params.orderId,
    beatId: params.beatId,
    licenseType: params.purchasedLicenseType,
    assetPath: asset.repoPath,
    downloadName: objectStorageService.getDownloadName(params.beatTitle, asset),
    contentType: asset.contentType,
    fileFormat: asset.fileFormat,
    expiresInSeconds: 30 * 24 * 60 * 60,
  });

  return {
    url: `${process.env.APP_URL}/api/download-master?token=${encodeURIComponent(token)}`,
    fileFormat: asset.fileFormat === "wav" ? "WAV" : "MP3",
  };
}

async function buildDownloadLinksForOrder(order: any, req: Request) {
  const downloadLinks = [];

  for (const item of order.items) {
    const beat = item.beat || (await storage.getBeat(item.beatId));
    if (!beat) continue;

    const variants = item.licenseType === "exclusive"
      ? (["standard", "premium"] as const)
      : ([item.licenseType] as const);

    for (const variant of variants) {
      try {
        const secureDownload = await createSecureDownloadLink({
          orderId: order.id,
          beatId: item.beatId,
          beatTitle: beat.title,
          audioFileUrl: beat.audioFileUrl,
          purchasedLicenseType: item.licenseType,
          assetLicenseType: variant,
          req,
        });

        const needsFormatSuffix = item.licenseType === "exclusive" || secureDownload.fileFormat === "WAV";

        downloadLinks.push({
          beatId: item.beatId,
          beatTitle: needsFormatSuffix ? `${beat.title} (${secureDownload.fileFormat})` : beat.title,
          downloadUrl: secureDownload.url,
          licenseType: item.licenseType,
          price: item.price,
          fileFormat: secureDownload.fileFormat,
        });
      } catch (error) {
        console.error(`Failed to create ${variant} download link for ${beat.title}:`, error);
      }
    }
  }

  return downloadLinks;
}

export async function handleTokenizedDownload(token: string, res: Response) {
  const tokenPayload = DownloadTokenService.verifyToken(token);
  if (!tokenPayload) {
    return res.status(401).json({ error: "Invalid or expired download token" });
  }

  const order = await storage.getOrderWithItems(tokenPayload.orderId);
  if (!order || order.status !== "completed") {
    return res.status(404).json({ error: "Order not found or not completed" });
  }

  const orderItem = order.items.find((item: any) => item.beatId === tokenPayload.beatId);
  if (!orderItem) {
    return res.status(403).json({ error: "Beat not found in order" });
  }

  if (orderItem.licenseType !== tokenPayload.licenseType) {
    return res.status(403).json({ error: "License type mismatch" });
  }

  const objectStorageService = new ObjectStorageService();

  const temporaryUrl = await objectStorageService.getTemporaryDownloadUrl(tokenPayload.assetPath);
  if (temporaryUrl) {
    res.setHeader("Cache-Control", "private, no-store");
    return res.redirect(302, temporaryUrl);
  }

  await objectStorageService.streamRepositoryPath(tokenPayload.assetPath, res, {
    cacheTtlSec: 0,
    cacheScope: "private",
    contentType: tokenPayload.contentType,
    contentDisposition: `attachment; filename="${getSafeFilename(tokenPayload.downloadName)}"`,
  });
}

export async function downloadMasterRoute(req: Request, res: Response) {
  try {
    const token = req.query.token as string | undefined;
    if (!token) {
      return res.status(401).json({ error: "Download token required" });
    }

    return await handleTokenizedDownload(token, res);
  } catch (error) {
    console.error("Error processing secure download:", error);
    if (error instanceof ObjectNotFoundError) {
      return res.status(404).json({ error: "Beat file not found" });
    }
    return res.status(500).json({ error: "Download failed" });
  }
}
