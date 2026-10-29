import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { RoomBadge } from "@/components/RoomBadge";

type Props = {
  href: string;
  number: number;
  title: ReactNode;
  detail?: ReactNode;
  trailing?: ReactNode;
  muted?: boolean;
  /** Position in the list, for the arrival stagger. */
  index?: number;
};

/** One room in a list: door plate, who lives there, what is due, and a status on the right. */
export function RoomRow({ href, number, title, detail, trailing, muted = false, index = 0 }: Props) {
  return (
    <li className="rise" style={{ "--i": index } as CSSProperties}>
      <Link
        href={href}
        className="row-press flex min-h-[4.75rem] items-center gap-3.5 px-4 py-3 outline-none focus-visible:bg-well focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-green"
      >
        <RoomBadge number={number} muted={muted} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={`truncate text-[1.0625rem] leading-snug font-semibold ${muted ? "text-ink/55" : "text-ink"}`}>
            {title}
          </span>
          {detail ? <span className="mt-0.5 text-[0.9375rem] leading-snug text-ink/65">{detail}</span> : null}
        </span>
        {trailing}
      </Link>
    </li>
  );
}

/** The white card a list of RoomRows sits in, rows split by faint rules. */
export function RoomList({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul aria-label={label} className="divide-y divide-line overflow-hidden rounded-card bg-card shadow-soft">
      {children}
    </ul>
  );
}
