/** The room number as a small door plate. */
export function RoomBadge({ number, size = "md", muted = false }: { number: number; size?: "md" | "lg"; muted?: boolean }) {
  const box = size === "lg" ? "size-16 rounded-[1.1rem] text-[1.9rem]" : "size-12 rounded-[0.9rem] text-[1.4rem]";
  return (
    <span
      className={`figure grid flex-none place-items-center leading-none font-medium ${box} ${
        muted ? "bg-well/70 text-ink/45" : "bg-well text-ink"
      }`}
      aria-hidden="true"
    >
      {number}
    </span>
  );
}
