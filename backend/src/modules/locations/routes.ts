import { Router } from "express";
import { z } from "zod";
import { serviceability } from "../../utils/geo.js";
import { asyncHandler, badRequest, ok } from "../../utils/errors.js";

const router = Router();

const serviceabilitySchema = z.object({ lat: z.coerce.number().gte(-90).lte(90), lng: z.coerce.number().gte(-180).lte(180) });

/** Whether a coordinate falls inside the configured delivery area. */
router.get(
  "/serviceability",
  asyncHandler(async (request, response) => {
    const parsed = serviceabilitySchema.safeParse(request.query);
    if (!parsed.success) throw badRequest("Valid latitude and longitude are required", "VALIDATION_ERROR");
    const result = await serviceability(parsed.data.lat, parsed.data.lng);
    return ok(response, {
      serviceable: result.serviceable,
      distanceKm: result.distanceKm,
      radiusKm: result.radiusKm,
      message: result.serviceable ? "Great, we deliver to this location" : "Sorry, we don't deliver here yet",
    });
  }),
);

export default router;
