// S1 (StayCheck v1.1) — room display fallback.
//
// A checklist instance may be tied to a real Room row (roomNumber) OR carry a
// free-text roomLabel (PRD §17/§24: "-", "Suite") when no Room exists. Every
// place the room shows prefers the real room, then the free-text label, then
// nothing — so a labelless instance never renders "Rm undefined".

/** The room's display string, or null when neither a room nor a label is set. */
export function roomDisplay(
  room: { roomNumber: string } | null | undefined,
  roomLabel: string | null | undefined,
): string | null {
  if (room?.roomNumber) return room.roomNumber;
  const trimmed = roomLabel?.trim();
  return trimmed ? trimmed : null;
}
