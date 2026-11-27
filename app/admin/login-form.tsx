"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { requestMagicLink } from "@/app/admin/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? "送信しています" : "ログイン用のリンクを送る"}
    </button>
  );
}

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, action] = useActionState(requestMagicLink, { message: "", tone: "ok" as const });

  return (
    <form className="admin-form" action={action}>
      <input type="hidden" name="next" value={nextPath} />
      <div className="admin-row">
        <label htmlFor="email">メールアドレス</label>
        <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
      </div>
      <div className="admin-actions">
        <SubmitButton />
      </div>
      {state.message ? (
        <p className={state.tone === "error" ? "admin-alert" : "admin-ok"} role={state.tone === "error" ? "alert" : "status"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
