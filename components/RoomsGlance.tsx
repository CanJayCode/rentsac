import Link from "next/link";

export type RoomState = "due" | "paid" | "vacant";

export const ROOM_STATE_CLASS: Record<RoomState, string> = {
  due: "bg-[#f1d2a0] text-amber-deep",
  paid: "bg-green-soft text-green-deep",
  vacant: "bg-transparent text-ink/40 ring-1 ring-inset ring-ink/12",
};

/** One numbered pill per room, in number order, coloured by what the room owes. Each opens its room. */
export function RoomsGlance({
  rooms,
  label,
  stateLabel,
}: {
  rooms: { number: number; state: RoomState }[];
  label: string;
  stateLabel: Record<RoomState, string>;
}) {
  return (
    <ul aria-label={label} className="grid grid-cols-8 gap-1.5">
      {rooms.map((room) => (
        <li key={room.number}>
          <Link
            href={`/rooms/${room.number}`}
            aria-label={`${room.number}: ${stateLabel[room.state]}`}
            className={`press figure flex h-10 items-center justify-center rounded-xl text-[1.0625rem] leading-none font-medium outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-1 ${ROOM_STATE_CLASS[room.state]}`}
          >
            {room.number}
          </Link>
        </li>
      ))}
    </ul>
  );
}
