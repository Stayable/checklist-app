"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { changeOwnPassword, type ChangeResult } from "./actions";

const input =
  "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none";

export function ProfileClient() {
  const t = useTranslations("Profile");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const errorText = (code: Exclude<ChangeResult, { ok: true }>["error"]) => {
    switch (code) {
      case "weak":
        return t("errWeak");
      case "wrong_current":
        return t("errWrongCurrent");
      case "same":
        return t("errSame");
      default:
        return t("errGeneric");
    }
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next !== confirm) {
      setMsg({ kind: "err", text: t("errMismatch") });
      return;
    }
    startTransition(async () => {
      const res = await changeOwnPassword({ currentPassword: current, newPassword: next });
      if (res.ok) {
        setMsg({ kind: "ok", text: t("success") });
        setCurrent("");
        setNext("");
        setConfirm("");
        router.refresh();
      } else {
        setMsg({ kind: "err", text: errorText(res.error) });
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg bg-white p-4 ring-1 ring-slate-200">
      <h2 className="text-sm font-semibold text-slate-800">{t("changePassword")}</h2>
      {msg && (
        <div
          className={`rounded-md p-2 text-sm ${
            msg.kind === "ok"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-red-50 text-red-700"
          }`}
        >
          {msg.text}
        </div>
      )}
      <label className="text-sm font-medium text-slate-700">
        {t("currentPassword")}
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className={input}
          required
        />
      </label>
      <label className="text-sm font-medium text-slate-700">
        {t("newPassword")}
        <input
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className={input}
          required
        />
      </label>
      <label className="text-sm font-medium text-slate-700">
        {t("confirmPassword")}
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={input}
          required
        />
      </label>
      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? t("saving") : t("save")}
        </button>
      </div>
    </form>
  );
}
