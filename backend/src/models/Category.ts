import { Schema, model } from "mongoose";

/** A browseable cuisine category shown on the customer homepage, e.g. Pizza. */
const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    slug: { type: String, required: true, trim: true, unique: true },
    emoji: { type: String, default: "🍽️" },
    image: { type: String, default: "" },
  },
  { timestamps: true },
);

export const Category = model("Category", categorySchema);
