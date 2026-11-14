import { initials } from "@/lib/format";

// A stable colour per name, so friends are easy to tell apart.
const HUES = [
  "bg-[#e8503c]/25 text-[#ffb3a6] ring-[#e8503c]/50",
  "bg-[#ffc76e]/20 text-[#ffd99c] ring-[#ffc76e]/45",
  "bg-[#3ccf9a]/20 text-[#9ff0d0] ring-[#3ccf9a]/45",
  "bg-[#d46cff]/20 text-[#ecbcff] ring-[#d46cff]/45",
  "bg-[#4cc3ff]/20 text-[#b0e6ff] ring-[#4cc3ff]/45",
];
const hue = (name: string) => HUES[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % HUES.length];

/** Friend photo, or their initials when there isn't one. */
export default function Avatar({ name, src, size = 28, className = "" }: { name: string; src?: string; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  return src ? (
    <img alt={name} src={src} referrerPolicy="no-referrer" style={style} className={`rounded-full object-cover shrink-0 ${className}`} />
  ) : (
    <span
      aria-label={name}
      translate="no"
      style={style}
      className={`rounded-full shrink-0 flex items-center justify-center ring-1 font-bold ${hue(name)} ${className}`}
    >
      {initials(name)}
    </span>
  );
}
