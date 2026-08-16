import { Router } from "express";
import multer from "multer";
import { authenticate, authorize, type AuthRequest } from "../../middleware/auth.js";
import { imageService, MAX_IMAGE_BYTES, sniffImageType } from "../../services/images.js";
import { asyncHandler, badRequest, notFound, ok } from "../../utils/errors.js";

const router = Router();

// Memory storage so validation can inspect the buffer before anything is written.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
});

router.use(authenticate, authorize("CUSTOMER", "RESTAURANT", "ADMIN"));

/**
 * POST /api/v1/uploads?folder=restaurants|menu|avatars
 * Multipart field "file". Server sniffs magic bytes, rejects non-images and
 * oversized files, generates a unique filename, and stores via the active
 * provider (ImageKit in production, local disk in dev).
 */
router.post(
  "/",
  upload.single("file"),
  asyncHandler(async (request: AuthRequest, response) => {
    if (!request.file) throw badRequest("Attach an image file", "VALIDATION_ERROR");
    const rawFolder = request.query.folder;
    const folder = String(Array.isArray(rawFolder) ? rawFolder[0] : rawFolder ?? "misc").replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "misc";
    const mimeType = sniffImageType(request.file.buffer, request.file.mimetype);
    const uploaded = await imageService.upload(request.file.buffer, {
      folder,
      fileName: request.file.originalname,
      mimeType,
    });
    // Local-provider URLs are relative (/uploads/...) — make them absolute so
    // they work from any frontend origin. ImageKit URLs are already absolute.
    if (uploaded.url.startsWith("/")) {
      const host = request.get("host") ?? `localhost:${process.env.PORT ?? 5000}`;
      uploaded.url = `${request.protocol}://${host}${uploaded.url}`;
    }
    return ok(response, { image: uploaded }, 201);
  }),
);

/**
 * DELETE /api/v1/uploads/:fileId — remove an uploaded image from the provider.
 */
router.delete(
  "/:fileId",
  asyncHandler(async (request: AuthRequest, response) => {
    const fileId = String(request.params.fileId);
    if (!fileId) throw notFound("Image not found", "IMAGE_NOT_FOUND");
    await imageService.delete(fileId);
    return response.status(204).send();
  }),
);

export default router;
