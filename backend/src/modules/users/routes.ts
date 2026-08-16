import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize, type AuthRequest } from "../../middleware/auth.js";
import { Address } from "../../models/Address.js";
import { asyncHandler, badRequest, notFound, ok } from "../../utils/errors.js";

const router = Router();

const addressSchema = z.object({
  label: z.enum(["Home", "Work", "Other"]),
  formattedAddress: z.string().trim().min(5, "Enter the full address").max(300),
  pincode: z.string().regex(/^\d{6}$/, "Enter a valid 6-digit pincode"),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  locality: z.string().trim().max(80).optional(),
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  deliveryInstructions: z.string().max(200).optional(),
  isDefault: z.boolean().optional(),
});

router.use(authenticate, authorize("CUSTOMER"));

const addressDto = (address: any) => ({
  id: address._id.toString(),
  label: address.label,
  formattedAddress: address.formattedAddress,
  pincode: address.pincode,
  city: address.city ?? "",
  state: address.state ?? "",
  locality: address.locality ?? "",
  latitude: address.latitude,
  longitude: address.longitude,
  deliveryInstructions: address.deliveryInstructions ?? "",
  isDefault: address.isDefault,
});

router.get("/addresses", asyncHandler(async (request: AuthRequest, response) => {
  const addresses = await Address.find({ userId: request.user!.id }).sort({ isDefault: -1, updatedAt: -1 });
  return ok(response, { addresses: addresses.map(addressDto) });
}));

router.post("/addresses", asyncHandler(async (request: AuthRequest, response) => {
  const parsed = addressSchema.safeParse(request.body);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message, "VALIDATION_ERROR");
  const { isDefault, ...data } = parsed.data;
  if (isDefault) await Address.updateMany({ userId: request.user!.id }, { $set: { isDefault: false } });
  const address = await Address.create({ ...data, isDefault: Boolean(isDefault), userId: request.user!.id });
  return ok(response, { address: addressDto(address) }, 201);
}));

router.patch("/addresses/:id", asyncHandler(async (request: AuthRequest, response) => {
  const parsed = addressSchema.partial().safeParse(request.body);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message, "VALIDATION_ERROR");
  if (parsed.data.isDefault) await Address.updateMany({ userId: request.user!.id, _id: { $ne: request.params.id } }, { $set: { isDefault: false } });
  const address = await Address.findOneAndUpdate({ _id: request.params.id, userId: request.user!.id }, parsed.data, { returnDocument: "after", runValidators: true });
  if (!address) throw notFound("Address not found", "ADDRESS_NOT_FOUND");
  return ok(response, { address: addressDto(address) });
}));

router.delete("/addresses/:id", asyncHandler(async (request: AuthRequest, response) => {
  const address = await Address.findOneAndDelete({ _id: request.params.id, userId: request.user!.id });
  if (!address) throw notFound("Address not found", "ADDRESS_NOT_FOUND");
  return response.status(204).send();
}));

export default router;
