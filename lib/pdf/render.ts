import { renderToBuffer } from "@react-pdf/renderer";
import type { ReactElement } from "react";

// Server-only: react-pdf needs the Node runtime. Route handlers that call this
// must declare `export const runtime = "nodejs"`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function renderPdfToBuffer(doc: ReactElement<any>): Promise<Buffer> {
  return renderToBuffer(doc);
}
