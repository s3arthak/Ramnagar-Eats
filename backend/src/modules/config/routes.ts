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
    return ok(response, {
      config: {
        baseDeliveryFee: config.service.baseDeliveryFee,
        deliveryFeeFreeAbove: config.service.freeDeliveryAbove,
        serviceRadiusKm: area.radiusKm,
      },
    });
  }),
);

export default router;
