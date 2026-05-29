import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";

// Admin → Templates. Read-only view of the 9 templates and their question sets
// (v1 — template editing is out of scope). Surfaces the placeholder-content
// warning so admins know the seeded questions aren't final.
export default async function AdminTemplatesPage() {
  await requireAdmin();

  const templates = await db.checklistTemplate.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      defaultRole: true,
      scope: true,
      reviewLevel: true,
      active: true,
      questions: {
        orderBy: { orderIndex: "asc" },
        select: { id: true, orderIndex: true, type: true, prompt: true, required: true },
      },
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Checklist templates</h1>
      <p className="mt-1 text-sm text-slate-500">Read-only in v1. {templates.length} templates.</p>

      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        ⚠️ Question content is placeholder. Replace with the real Connecteam /
        Smartsheet question sets before training or go-live.
      </div>

      <div className="mt-6 flex flex-col gap-4">
        {templates.map((tmpl) => (
          <details key={tmpl.id} className="rounded-xl border border-slate-200 bg-white">
            <summary className="flex cursor-pointer items-center justify-between px-4 py-3">
              <span className="font-semibold text-slate-900">
                <span className="font-mono text-xs text-slate-400">{tmpl.code}</span> {tmpl.name}
              </span>
              <span className="text-xs text-slate-500">
                {tmpl.defaultRole} · {tmpl.scope} · review: {tmpl.reviewLevel} · {tmpl.questions.length} questions
              </span>
            </summary>
            <ol className="divide-y divide-slate-100 border-t border-slate-100">
              {tmpl.questions.map((q) => (
                <li key={q.id} className="flex items-start gap-3 px-4 py-2 text-sm">
                  <span className="w-6 text-right font-mono text-xs text-slate-400">{q.orderIndex}</span>
                  <span className="w-28 shrink-0 font-mono text-xs text-slate-500">{q.type}</span>
                  <span className="text-slate-700">
                    {q.prompt}
                    {!q.required && <span className="ml-1 text-xs text-slate-400">(optional)</span>}
                  </span>
                </li>
              ))}
            </ol>
          </details>
        ))}
      </div>
    </div>
  );
}
