import { Router } from "express";
import { z } from "zod";
import { authenticate, type AuthRequest } from "../../middleware/auth.js";
import { User, type UserRole } from "../../models/User.js";
import { asyncHandler, badRequest, conflict, notFound, ok } from "../../utils/errors.js";
import { normalizePhone } from "../../utils/phone.js";

const router = Router();

const publicUser = (user: { id: string; name: string; phone?: string | null; email?: string | null; role: UserRole; avatar?: string | null }) => ({
  id: user.id,
  name: user.name,
  phone: user.phone ?? undefined,
  email: user.email ?? undefined,
  role: user.role,
  avatar: user.avatar ?? undefined,
});

router.post("/logout", authenticate, asyncHandler(async (_request, response) => ok(response, { message: "Signed out" })));

router.get(
  "/me",
  authenticate,
  asyncHandler(async (request: AuthRequest, response) => {
    const user = await User.findById(request.user!.id).select("name phone email role emailVerified avatar");
    if (!user) throw notFound("Account not found", "ACCOUNT_NOT_FOUND");
    return ok(response, { user: publicUser(user) });
  }),
);

const updateMeSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80).optional(),
  phone: z.string().min(7).max(20).optional().or(z.literal("")),
  avatar: z.string().max(400).refine((value) => /^(https?:\/\/|\/uploads\/)/.test(value), "Invalid image URL").optional().or(z.literal("")),
});

router.patch(
  "/me",
  authenticate,
  asyncHandler(async (request: AuthRequest, response) => {
    const parsed = updateMeSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message, "VALIDATION_ERROR");
    const update: Record<string, unknown> = {};
    if (parsed.data.name) update.name = parsed.data.name.trim();
    if (parsed.data.phone !== undefined) {
      if (parsed.data.phone.trim()) {
        try {
          update.phone = normalizePhone(parsed.data.phone);
        } catch (caught) {
          throw badRequest(caught instanceof Error ? caught.message : "Enter a valid phone number", "VALIDATION_ERROR");
        }
      } else {
        update.phone = undefined;
      }
      if (update.phone) {
        const taken = await User.findOne({ phone: update.phone, _id: { $ne: request.user!.id } });
        if (taken) throw conflict("That phone number is already in use", "PHONE_TAKEN");
      }
    }
    if (parsed.data.avatar !== undefined) update.avatar = parsed.data.avatar.trim() || undefined;
    const user = await User.findByIdAndUpdate(request.user!.id, update, { returnDocument: "after", runValidators: true }).select("name phone email role avatar");
    if (!user) throw notFound("Account not found", "ACCOUNT_NOT_FOUND");
    return ok(response, { user: publicUser(user) });
  }),
);

export default router;
