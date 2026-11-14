import { initials } from "@/lib/format";

/** Friend photo, or their initials when there isn't one. */
export default function Avatar({ name, src, size = 28, className = "" }: { name: string; src?: string; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  return src ? (
    <img alt={name} src={src} style={style} className={`rounded-full object-cover shrink-0 ${className}`} />
  ) : (
    <span
      aria-label={name}
      style={style}
      className={`rounded-full shrink-0 flex items-center justify-center bg-surface-container-highest text-on-surface-variant font-bold ${className}`}
    >
      {initials(name)}
    </span>
  );
}
