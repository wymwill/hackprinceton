import { appIcon } from "@/lib/appIcon";

/** The icon iOS uses when someone adds Alea to their home screen. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return appIcon(size.width);
}
