/**
 * Avatar choices for the profile page. Avatars are https image URLs because
 * that's all the database keeps (see `_bs_me_avatar` in the migrations), so
 * picked avatars come from DiceBear, a free avatar service, keyed by a seed,
 * and uploaded ones from a public Supabase Storage bucket.
 */
import { supabase } from "./supabase.ts";

export const AVATAR_STYLES = [
  { id: "fun-emoji", label: "Faces" },
  { id: "bottts-neutral", label: "Robots" },
  { id: "thumbs", label: "Ghosts" },
] as const;

export type AvatarStyle = (typeof AVATAR_STYLES)[number]["id"];

const BASE = "https://api.dicebear.com/9.x/";

/**
 * Faces exclude extra drops, thermometers, and masks.
 */
const FACE_MOUTHS = ["plain", "lilSmile", "sad", "shy", "cute", "wideSmile", "shout", "smileTeeth", "smileLol", "pissed", "tongueOut", "kissHeart"];

const EXTRA: Partial<Record<AvatarStyle, string>> = {
  "fun-emoji": `&mouth=${FACE_MOUTHS.join(",")}`,
};

export function avatarUrl(style: AvatarStyle, seed: string) {
  return `${BASE}${style}/svg?seed=${encodeURIComponent(seed)}${EXTRA[style] ?? ""}`;
}

/** The style and seed of a DiceBear avatar URL, or null for any other picture. */
export function parseAvatar(url?: string | null): { style: AvatarStyle; seed: string } | null {
  if (!url?.startsWith(BASE)) return null;
  const m = url.slice(BASE.length).match(/^([a-z-]+)\/svg\?seed=([^&]*)/);
  const style = AVATAR_STYLES.find((s) => s.id === m?.[1])?.id;
  return style && m ? { style, seed: decodeURIComponent(m[2]) } : null;
}

export const randomSeed = () => Math.random().toString(36).slice(2, 10);

/** Bucket for uploaded pictures (supabase/migrations/202611140008_avatar_uploads.sql). */
const BUCKET = "avatars";

/** Crop to a centered square and shrink to 256px, so uploads stay small and load fast. */
async function squareImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.88));
  if (!blob) throw new Error("Couldn't read that image.");
  return blob;
}

/** Upload your own picture and return its public https URL. */
export async function uploadAvatar(file: File): Promise<string> {
  if (!supabase) throw new Error("Sign-in isn't set up.");
  if (!file.type.startsWith("image/")) throw new Error("Pick an image file.");
  if (file.size > 10 * 1024 * 1024) throw new Error("That image is over 10 MB.");
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Sign in first.");
  const blob = await squareImage(file);
  const path = `${data.user.id}/${Date.now()}.webp`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw new Error(/bucket not found/i.test(error.message) ? "Photo uploads aren't set up yet. Pick a picture instead." : error.message);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
