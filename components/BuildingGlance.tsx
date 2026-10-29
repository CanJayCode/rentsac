export type WindowState = "due" | "paid" | "vacant";

export const WINDOW_FILL: Record<WindowState, string> = {
  due: "#eda23a",
  paid: "#7cc496",
  vacant: "#3a4d43",
};

const COLS = 4;

/**
 * The building from the lock screen, one window per room: amber owes, green paid up, dark vacant.
 * Room 1 sits on the ground floor, left; higher numbers climb the floors.
 */
export function BuildingGlance({ rooms, label }: { rooms: { number: number; state: WindowState }[]; label: string }) {
  const floors = Math.max(1, Math.ceil(rooms.length / COLS));
  const doorTop = 13 + (floors - 1) * 13 + 8.5 + 6.5;
  const height = doorTop + 17;

  return (
    <svg
      width={70 * 0.94}
      height={height * 0.94}
      viewBox={`0 0 70 ${height}`}
      role="img"
      aria-label={label}
      className="block flex-none"
    >
      <rect x="0" y="0" width="70" height="7" rx="2" fill="var(--ink)" />
      <rect x="4" y="5" width="62" height={height - 5} rx="2.5" fill="var(--ink)" />
      {rooms.map((room, i) => {
        const floorFromTop = floors - 1 - Math.floor(i / COLS);
        const col = i % COLS;
        return (
          <rect
            key={room.number}
            className="window"
            x={10.75 + col * 13.5}
            y={13 + floorFromTop * 13}
            width="8"
            height="8.5"
            rx="1"
            fill={WINDOW_FILL[room.state]}
          >
            <title>{room.number}</title>
          </rect>
        );
      })}
      <rect x="29" y={doorTop} width="12" height="17" rx="1.5" fill="var(--bg)" />
    </svg>
  );
}
