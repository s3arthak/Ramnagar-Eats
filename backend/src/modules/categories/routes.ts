import { Router } from "express";
import { Category } from "../../models/Category.js";
import { asyncHandler, ok } from "../../utils/errors.js";

const router = Router();

router.get(
  "/",
  asyncHandler(async (_request, response) => {
    const categories = await Category.find().sort({ name: 1 }).lean();
    return ok(response, { categories: categories.map((category) => ({ id: category._id.toString(), name: category.name, slug: category.slug, emoji: category.emoji })) });
  }),
);

export default router;
