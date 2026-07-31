import { describe, expect, it } from "vitest";
import { csvField, csvFilename, csvRow, toCsv } from "./csv";

describe("csvField", () => {
  it("leaves plain values alone", () => {
    expect(csvField("AC Pro")).toBe("AC Pro");
    expect(csvField(42)).toBe("42");
  });

  it("quotes a value containing a comma", () => {
    // The real case: device names like "AC Pro, Rm 2" would otherwise shift
    // every later column in the row.
    expect(csvField("AC Pro, Rm 2")).toBe('"AC Pro, Rm 2"');
  });

  it("doubles embedded quotes", () => {
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
  });

  it("quotes values containing newlines — resolution notes are free text", () => {
    expect(csvField("line1\nline2")).toBe('"line1\nline2"');
    expect(csvField("line1\r\nline2")).toBe('"line1\r\nline2"');
  });

  it("renders null/undefined as an empty cell, not the word null", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });

  it("keeps a literal zero — falsy is not the same as absent", () => {
    expect(csvField(0)).toBe("0");
    expect(csvField(false)).toBe("false");
  });
});

describe("csvRow", () => {
  it("joins fields with commas, quoting only what needs it", () => {
    expect(csvRow(["TKT-1", "AC Pro, Rm 2", null, 3])).toBe('TKT-1,"AC Pro, Rm 2",,3');
  });
});

describe("toCsv", () => {
  it("writes a BOM, CRLF line endings and a trailing newline", () => {
    const out = toCsv(["a", "b"], [[1, 2]]);
    expect(out.startsWith("﻿")).toBe(true); // Excel/Windows encoding guard
    expect(out).toBe("﻿a,b\r\n1,2\r\n");
  });

  it("handles a header with no rows", () => {
    expect(toCsv(["a"], [])).toBe("﻿a\r\n");
  });
});

describe("csvFilename", () => {
  it("builds a chronologically sortable name", () => {
    expect(csvFilename("tickets", "2026-08-01")).toBe("tickets_2026-08-01.csv");
  });
});
