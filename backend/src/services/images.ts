import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { ImageKit, toFile } from "@imagekit/nodejs";
import { badRequest } from "../utils/errors.js";

/**
 * Image storage abstraction. Business logic only ever calls this interface;
 * the provider is chosen from env: IMAGEKIT_* keys enable the real ImageKit
 * CDN provider, otherwise (local dev / tests) images are written to disk and
 * served by the API from /uploads — no external credentials required.
 */

export interface UploadedImage {
  url: string;
  fileId: string;
  width?: number;
  height?: number;
  size?: number;
}

export interface ImageService {
  upload(buffer: Buffer, options: { folder: string; fileName: string; mimeType: string }): Promise<UploadedImage>;
  delete(fileId: string): Promise<void>;
}

/** Accepted image MIME types and their canonical extensions. */
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Validate that the buffer is actually the image type it claims to be by
 * sniffing magic bytes. The MIME type from the client is never trusted on its
 * own — this guards against renamed executables or HTML payloads.
 */
export function sniffImageType(buffer: Buffer, claimedMime: string): string {
  if (!ALLOWED_TYPES[claimedMime]) throw badRequest("Only JPEG, PNG, WebP, GIF or AVIF images are allowed", "INVALID_IMAGE_TYPE");
  const hex = (count: number) => Array.from(buffer.subarray(0, count)).map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
  const signature = hex(12);
  const matches = (prefix: number[]) => prefix.every((byte, index) => buffer[index] === byte);
  const isWebp = signature.startsWith("52 49 46 46") && buffer.subarray(8, 12).toString("latin1") === "WEBP";
  const isJpeg = matches([0xff, 0xd8, 0xff]);
  const isPng = matches([0x89, 0x50, 0x4e, 0x47]);
  const isGif = matches([0x47, 0x49, 0x46, 0x38]);
  const isAvif = buffer.length >= 12 && buffer.subarray(4, 8).toString("latin1") === "ftyp" && ["avif", "avis", "av01"].includes(buffer.subarray(8, 12).toString("latin1"));
  if (claimedMime === "image/jpeg" && !isJpeg) throw badRequest("File is not a valid JPEG image", "INVALID_IMAGE_TYPE");
  if (claimedMime === "image/png" && !isPng) throw badRequest("File is not a valid PNG image", "INVALID_IMAGE_TYPE");
  if (claimedMime === "image/gif" && !isGif) throw badRequest("File is not a valid GIF image", "INVALID_IMAGE_TYPE");
  if (claimedMime === "image/webp" && !isWebp) throw badRequest("File is not a valid WebP image", "INVALID_IMAGE_TYPE");
  if (claimedMime === "image/avif" && !isAvif) throw badRequest("File is not a valid AVIF image", "INVALID_IMAGE_TYPE");
  return claimedMime;
}

function uniqueFileName(originalName: string): string {
  // Never trust the client filename: derive a safe extension from the whitelist
  // only, and always generate a fresh unique name.
  const ext = path.extname(originalName).toLowerCase();
  const safeExt = Object.values(ALLOWED_TYPES).includes(ext) ? ext : ".jpg";
  return `${Date.now()}-${randomBytes(6).toString("hex")}${safeExt}`;
}

/** Production provider: real ImageKit CDN (resizing, optimization, delivery). */
class ImageKitProvider implements ImageService {
  private readonly client: ImageKit;

  constructor() {
    this.client = new ImageKit({
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY ?? "",
      // The upload response carries the absolute CDN URL, so no urlEndpoint needed here.
    });
  }

  async upload(buffer: Buffer, options: { folder: string; fileName: string; mimeType: string }) {
    const file = await toFile(buffer, uniqueFileName(options.fileName), { type: options.mimeType });
    const response = await this.client.files.upload({
      file,
      fileName: file.name,
      folder: options.folder.replace(/^\/+|\/+$/g, ""),
      useUniqueFileName: false,
      isPrivateFile: false,
    });
    return {
      url: response.url ?? "",
      fileId: response.fileId ?? "",
      width: response.width,
      height: response.height,
      size: response.size,
    };
  }

  async delete(fileId: string) {
    if (!fileId || fileId.startsWith("local-")) return;
    try {
      await this.client.files.delete(fileId);
    } catch (error: any) {
      // Deleting an already-missing file is not an error worth surfacing.
      if (error?.status !== 404) throw error;
    }
  }
}

/**
 * Local-dev provider: writes to <backend>/uploads and returns API-served URLs
 * (/uploads/...). Keeps the whole upload flow real end-to-end without any
 * external credentials.
 */
class LocalProvider implements ImageService {
  private readonly dir = path.resolve(process.cwd(), "uploads");

  async upload(buffer: Buffer, options: { folder: string; fileName: string; mimeType: string }) {
    await mkdir(this.dir, { recursive: true });
    const name = uniqueFileName(options.fileName);
    const fileId = `local-${name}`;
    await writeFile(path.join(this.dir, name), buffer);
    return { url: `/uploads/${name}`, fileId, size: buffer.length };
  }

  async delete(fileId: string) {
    if (!fileId.startsWith("local-")) return;
    const name = fileId.slice("local-".length);
    await unlink(path.join(this.dir, name)).catch(() => {
      /* already gone */
    });
  }
}

function provider(): ImageService {
  if (process.env.IMAGEKIT_PUBLIC_KEY && process.env.IMAGEKIT_PRIVATE_KEY && process.env.IMAGEKIT_URL_ENDPOINT) {
    return new ImageKitProvider();
  }
  return new LocalProvider();
}

export const imageService: ImageService = provider();
