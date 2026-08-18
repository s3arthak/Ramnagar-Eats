import { Router } from "express";
import { config } from "../../config.js";
import { getServiceArea } from "../../services/service-area.js";
import { asyncHandler, ok } from "../../utils/errors.js";

const router = Router();

/** Public, display-only configuration. Order prices are always recomputed server-side. */
router.get(
  "/",
  asyncHandler(async (_request, response) => {
    const area = await getServiceArea();
    response.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=30");
    return ok(response, {
      config: {
        brandName: config.brandName,
        currency: config.currency,
        baseDeliveryFee: config.service.baseDeliveryFee,
        deliveryFeeFreeAbove: config.service.freeDeliveryAbove,
        serviceRadiusKm: area.radiusKm,
        serviceCenter: { lat: area.lat, lng: area.lng },
      },
    });
  }),
);

export default router;
