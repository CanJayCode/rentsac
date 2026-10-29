import "server-only";
import { notFound } from "next/navigation";
import { getRepo } from "@/lib/repo";
import { todayIST } from "@/lib/today";

/** The room for a `[room]` URL segment, its tenants and today's date; 404 for anything that is not a room. */
export async function loadRoom(param: string) {
  if (!/^\d{1,4}$/.test(param)) notFound();
  const repo = await getRepo();
  const room = (await repo.listRooms()).find((r) => r.number === Number(param));
  if (!room) notFound();

  const tenants = (await repo.listTenants()).filter((tn) => tn.roomId === room.id);
  const active = tenants.find((tn) => !tn.leftOn) ?? null;
  return { repo, room, tenants, active, today: todayIST() };
}
