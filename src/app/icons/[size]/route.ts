import { appIcon } from "@/lib/appIcon";

/** Home screen icons for the web manifest: /icons/192 and /icons/512. */
const SIZES = ["192", "512"];

export function generateStaticParams() {
  return SIZES.map((size) => ({ size }));
}

export async function GET(_req: Request, ctx: RouteContext<"/icons/[size]">) {
  const { size } = await ctx.params;
  if (!SIZES.includes(size)) return new Response("Not found", { status: 404 });
  return appIcon(Number(size));
}
