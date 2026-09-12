import { Router } from "express";
import { Banner } from "../../models/Banner.js";
import { asyncHandler, ok } from "../../utils/errors.js";

const router = Router();

/** GET /api/v1/banners — active banners for the customer home carousel. */
router.get(
  "/",
  asyncHandler(async (_request, response) => {
    const banners = await Banner.find({ isActive: true }).sort({ sortOrder: 1, createdAt: -1 }).limit(10).lean();
    response.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
    return ok(response, {
      banners: banners.map((banner) => ({
        id: banner._id.toString(),
        title: banner.title,
        subtitle: banner.subtitle,
        ctaLabel: banner.ctaLabel,
        ctaLink: banner.ctaLink,
        image: banner.image,
        theme: banner.theme,
      })),
    });
  }),
);

export default router;
