/**
 * Load the room inventory from the Cloudbeds export Kyle supplied
 * (scripts/data/RoomZoning_Stayable_081226.json, captured 2026-08-11).
 *
 * Run:  pnpm dotenv -e .env.production.local -- tsx scripts/load-rooms.ts [--apply]
 *
 * Idempotent: rooms are matched on (propertyId, roomNumber) — the table's own
 * unique key — so re-running updates zone/type in place and never duplicates.
 * Nothing is ever deleted: a room that disappears from a future export is
 * reported, not removed, because checklist instances and issues reference rooms
 * and a delete would either fail on the FK or take history with it.
 *
 * ⚠ OCCUPANCY IS NOT IN THIS DATA, BY DESIGN. The export says so outright:
 * occupancy and out-of-order state "change daily and would be stale the moment
 * this file is written". So every room lands on the schema default, VACANT.
 * That is a placeholder, not a fact — until a PMS sync or manual upkeep exists,
 * a recurring rule filtered on occupied/vacant is filtering on a default.
 * This script therefore never overwrites the status of a room that already
 * exists: if someone has set one to OOO by hand, a reload must not undo it.
 *
 * ⚠ ZONING FOR JW, DP AND KW IS PROVISIONAL at the source (`provisionalZoning`
 * in the file). Loaded as given and flagged in the output.
 */

import { readFileSync } from "fs";
import { db } from "../lib/db";

const DEFAULT_FILE = "scripts/data/RoomZoning_Stayable_081226.json";

type SourceRoom = { room: string; roomType: string | null; zone: string | null };
type SourceProperty = {
  code: string;
  propertyId: string;
  name: string;
  county: string;
  roomCount: number;
  zoneCounts: Record<string, number>;
  rooms: SourceRoom[];
};
type Export = {
  generatedFrom: string;
  capturedAt: string;
  zoneSource: string;
  note: string;
  provisionalZoning: string[];
  totalRooms: number;
  properties: SourceProperty[];
};

async function main() {
  const apply = process.argv.includes("--apply");
  const fileIndex = process.argv.indexOf("--file");
  const file = fileIndex > -1 ? process.argv[fileIndex + 1] : DEFAULT_FILE;
  const data: Export = JSON.parse(readFileSync(file, "utf8"));

  console.log(`source: ${data.generatedFrom}, captured ${data.capturedAt}`);
  console.log(`${data.totalRooms} rooms across ${data.properties.length} properties`);
  console.log(`provisional zoning: ${data.provisionalZoning.join(", ")}`);
  console.log(apply ? "MODE: apply\n" : "MODE: dry run (nothing will be written)\n");

  const properties = await db.property.findMany({
    select: { id: true, propertyId: true, shortCode: true },
  });
  const byPropertyId = new Map(properties.map((p) => [p.propertyId, p]));

  let totalCreate = 0;
  let totalUpdate = 0;
  let totalUnchanged = 0;
  const problems: string[] = [];
  const vanished: string[] = [];

  for (const source of data.properties) {
    const property = byPropertyId.get(source.propertyId);
    if (!property) {
      problems.push(`${source.code}: property id ${source.propertyId} not in the database`);
      continue;
    }
    if (property.shortCode !== source.code) {
      problems.push(
        `${source.code}: file says ${source.code} for ${source.propertyId}, DB says ${property.shortCode}`,
      );
      continue;
    }
    if (source.rooms.length !== source.roomCount) {
      problems.push(
        `${source.code}: roomCount says ${source.roomCount} but the file lists ${source.rooms.length}`,
      );
    }

    // Duplicate room numbers within one property would silently collapse on the
    // unique key, so they are caught rather than absorbed.
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const r of source.rooms) {
      const key = String(r.room).trim();
      if (seen.has(key)) duplicates.add(key);
      seen.add(key);
    }
    if (duplicates.size > 0) {
      problems.push(`${source.code}: duplicate room numbers in the file — ${[...duplicates].join(", ")}`);
    }

    const existing = await db.room.findMany({
      where: { propertyId: property.id },
      select: { id: true, roomNumber: true, zone: true, roomType: true },
    });
    const existingByNumber = new Map(existing.map((r) => [r.roomNumber, r]));

    let create = 0;
    let update = 0;
    let unchanged = 0;

    for (const r of source.rooms) {
      const roomNumber = String(r.room).trim();
      if (!roomNumber) {
        problems.push(`${source.code}: a row has an empty room number`);
        continue;
      }
      const zone = r.zone?.trim() || null;
      const roomType = r.roomType?.trim() || null;
      const current = existingByNumber.get(roomNumber);

      if (!current) {
        create++;
        if (apply) {
          // status intentionally omitted -> schema default VACANT.
          await db.room.create({
            data: { propertyId: property.id, roomNumber, zone, roomType },
          });
        }
        continue;
      }
      if (current.zone === zone && current.roomType === roomType) {
        unchanged++;
        continue;
      }
      update++;
      if (apply) {
        // Only zone/type — never status, so a hand-set OOO survives a reload.
        await db.room.update({ where: { id: current.id }, data: { zone, roomType } });
      }
    }

    for (const r of existing) {
      if (!seen.has(r.roomNumber)) vanished.push(`${source.code} ${r.roomNumber}`);
    }

    const zones = Object.keys(source.zoneCounts).length;
    console.log(
      `  ${source.code.padEnd(3)} ${String(source.rooms.length).padStart(4)} rooms · ${zones} zones · ` +
        `create ${String(create).padStart(4)} · update ${String(update).padStart(3)} · unchanged ${String(unchanged).padStart(4)}` +
        (data.provisionalZoning.includes(source.code) ? "   (zoning provisional)" : ""),
    );

    totalCreate += create;
    totalUpdate += update;
    totalUnchanged += unchanged;
  }

  if (vanished.length > 0) {
    console.log(
      `\nin the database but NOT in this export (${vanished.length}) — left in place, not deleted:`,
    );
    console.log(`    ${vanished.slice(0, 20).join(", ")}${vanished.length > 20 ? ", …" : ""}`);
  }
  if (problems.length > 0) {
    console.log("\n⚠ problems:");
    for (const p of problems) console.log(`    ${p}`);
  }

  console.log(
    `\ntotals — create ${totalCreate} · update ${totalUpdate} · unchanged ${totalUnchanged}`,
  );
  if (!apply) {
    console.log("\nRe-run with --apply to write.");
  } else {
    console.log(
      "\nEvery new room is VACANT because the export excludes occupancy — that is a default, not a fact.",
    );
  }
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
