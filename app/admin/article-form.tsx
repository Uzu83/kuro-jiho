"use client";

import { useActionState, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useFormStatus } from "react-dom";
import { ArticleDocument } from "@/app/articles/[slug]/article-document";
import { submitArticle } from "@/app/admin/actions";
import type { ArticleDraft, CheckedDraft, Choice, RemovedDraft, SourceDraft } from "@/lib/admin/draft";
import { MAX_FORM_ROWS } from "@/lib/admin/form";
import type { ArticleFormState } from "@/lib/admin/submit";

const INITIAL: ArticleFormState = {
  errors: [],
  warnings: [],
  fieldErrors: {},
  preview: null,
};

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages || messages.length === 0) {
    return null;
  }
  return <p className="admin-error">{messages.join(" ")}</p>;
}

function FormButtons({ mode, status }: { mode: "create" | "edit"; status: string | null }) {
  const { pending } = useFormStatus();
  const published = status === "published";

  return (
    <div className="admin-actions">
      <button type="submit" name="intent" value="preview" disabled={pending}>
        プレビュー
      </button>
      <button type="submit" name="intent" value="save" disabled={pending}>
        {mode === "create" ? "下書きとして保存" : "保存"}
      </button>
      {published ? null : (
        <button type="submit" name="intent" value="publish" disabled={pending}>
          公開する
        </button>
      )}
      {published ? (
        <button type="submit" name="intent" value="unpublish" disabled={pending}>
          非公開にする
        </button>
      ) : null}
    </div>
  );
}

export function ArticleForm({
  mode,
  draft,
  themes,
  slots,
  currentSlug,
}: {
  mode: "create" | "edit";
  draft: ArticleDraft;
  themes: Choice[];
  slots: Choice[];
  currentSlug?: string;
}) {
  const [state, formAction] = useActionState(submitArticle, INITIAL);
  const [title, setTitle] = useState(draft.title);
  const [slug, setSlug] = useState(draft.slug);
  const [theme, setTheme] = useState(draft.theme);
  const [slot, setSlot] = useState(draft.slot);
  const [date, setDate] = useState(draft.date);
  const [summary, setSummary] = useState<[string, string, string]>(draft.summary);
  const [body, setBody] = useState(draft.body);
  const [sources, setSources] = useState<SourceDraft[]>(draft.sources);
  const [checked, setChecked] = useState<CheckedDraft[]>(draft.checked);
  const [removed, setRemoved] = useState<RemovedDraft[]>(draft.removed);
  const [related, setRelated] = useState(draft.related);
  const [changeKind, setChangeKind] = useState("correction");
  const [changeNote, setChangeNote] = useState("");

  useEffect(() => {
    if (state.errors.length > 0) {
      document.getElementById("admin-form-errors")?.scrollIntoView({ block: "nearest" });
    } else if (state.preview) {
      document.getElementById("admin-preview")?.scrollIntoView({ block: "nearest" });
    }
  }, [state]);

  const published = draft.status === "published";
  const errors = state.fieldErrors;

  return (
    <form
      className="admin-form"
      action={formAction}
    >
      <input type="hidden" name="mode" value={mode} />
      {currentSlug ? <input type="hidden" name="current_slug" value={currentSlug} /> : null}
      <input type="hidden" name="source_count" value={sources.length} />
      <input type="hidden" name="checked_count" value={checked.length} />
      <input type="hidden" name="removed_count" value={removed.length} />

      {state.errors.length > 0 ? (
        <div id="admin-form-errors" className="admin-alert" role="alert" tabIndex={-1}>
          <p>入力を確認してください。</p>
          <ul>
            {state.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {state.warnings.length > 0 ? (
        <div className="admin-warn" role="status">
          <ul>
            {state.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="admin-fixed">この記事はAIが書いたものとして保存されます。変更はできません。</p>
      <p className="admin-hint">記事の削除はできません。公開をやめるときは非公開にします。</p>

      <div className="admin-row">
        <label htmlFor="title">見出し</label>
        <input id="title" name="title" value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} />
        <FieldError messages={errors.title} />
      </div>

      <div className="admin-row">
        <label htmlFor="slug">slug</label>
        <input id="slug" name="slug" value={slug} onChange={(event) => setSlug(event.target.value)} autoCapitalize="none" spellCheck={false} />
        <p className="admin-hint">YYYY-MM-DD-枠-名前。枠は 07、12、17、20 で、日付と枠の欄と揃えます。</p>
        <FieldError messages={errors.slug} />
      </div>

      <div className="admin-grid">
        <div className="admin-row">
          <label htmlFor="theme">テーマ</label>
          <select id="theme" name="theme" value={theme} onChange={(event) => setTheme(event.target.value)}>
            {themes.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <FieldError messages={errors.theme} />
        </div>
        <div className="admin-row">
          <label htmlFor="slot">枠</label>
          <select id="slot" name="slot" value={slot} onChange={(event) => setSlot(event.target.value)}>
            {slots.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <FieldError messages={errors.slot} />
        </div>
        <div className="admin-row">
          <label htmlFor="date">日付</label>
          <input id="date" name="date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <FieldError messages={errors.date} />
        </div>
      </div>

      <fieldset className="admin-row">
        <legend>3行要約</legend>
        {summary.map((line, index) => (
          <div key={index}>
            <label htmlFor={`summary_${index}`} className="admin-sub">
              {index + 1}行目
            </label>
            <input
              id={`summary_${index}`}
              name={`summary_${index}`}
              value={line}
              onChange={(event) => {
                const next = [...summary] as [string, string, string];
                next[index] = event.target.value;
                setSummary(next);
              }}
            />
            <FieldError messages={errors[`summary[${index}]`]} />
          </div>
        ))}
      </fieldset>

      <div className="admin-row">
        <label htmlFor="body_md">本文</label>
        <textarea id="body_md" name="body_md" value={body} rows={12} onChange={(event) => setBody(event.target.value)} />
        <p className="admin-hint">300〜4000字。出典は ［1］ のように書きます。生のHTMLと画像記法は使えません。</p>
        <FieldError messages={errors.body_md} />
      </div>

      <fieldset className="admin-row">
        <legend>出典</legend>
        {sources.map((source, index) => (
          <div key={index} className="admin-card">
            <div className="admin-grid">
              <div>
                <label htmlFor={`source_${index}_id`}>id</label>
                <input
                  id={`source_${index}_id`}
                  name={`source_${index}_id`}
                  value={source.id}
                  onChange={(event) => updateSource(setSources, index, { id: event.target.value })}
                />
                <FieldError messages={errors[`sources[${index}].id`]} />
              </div>
              <div>
                <label htmlFor={`source_${index}_title`}>題名</label>
                <input
                  id={`source_${index}_title`}
                  name={`source_${index}_title`}
                  value={source.title}
                  onChange={(event) => updateSource(setSources, index, { title: event.target.value })}
                />
                <FieldError messages={errors[`sources[${index}].title`]} />
              </div>
            </div>
            <label htmlFor={`source_${index}_publisher`}>発行元</label>
            <input
              id={`source_${index}_publisher`}
              name={`source_${index}_publisher`}
              value={source.publisher}
              onChange={(event) => updateSource(setSources, index, { publisher: event.target.value })}
            />
            <FieldError messages={errors[`sources[${index}].publisher`]} />
            <label htmlFor={`source_${index}_url`}>URL</label>
            <input
              id={`source_${index}_url`}
              name={`source_${index}_url`}
              value={source.url}
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => updateSource(setSources, index, { url: event.target.value })}
            />
            <FieldError messages={errors[`sources[${index}].url`]} />
            <label htmlFor={`source_${index}_accessed_at`}>確認日時</label>
            <input
              id={`source_${index}_accessed_at`}
              name={`source_${index}_accessed_at`}
              value={source.accessedAt}
              placeholder="2026-12-01T07:00:00+09:00"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => updateSource(setSources, index, { accessedAt: event.target.value })}
            />
            <FieldError messages={errors[`sources[${index}].accessed_at`]} />
            <label htmlFor={`source_${index}_license`}>ライセンス（任意）</label>
            <input
              id={`source_${index}_license`}
              name={`source_${index}_license`}
              value={source.license}
              onChange={(event) => updateSource(setSources, index, { license: event.target.value })}
            />
            <FieldError messages={errors[`sources[${index}].license`]} />
            {sources.length > 1 ? (
              <button type="button" className="admin-text-button" onClick={() => setSources(sources.filter((_, item) => item !== index))}>
                この行を外す
              </button>
            ) : null}
          </div>
        ))}
        <FieldError messages={errors.sources} />
        {sources.length >= MAX_FORM_ROWS ? (
          <p className="admin-hint">出典は{MAX_FORM_ROWS}件までです。</p>
        ) : (
          <button
            type="button"
            onClick={() =>
              setSources([
                ...sources,
                { id: String(sources.length + 1), title: "", publisher: "", url: "", accessedAt: "", license: "" },
              ])
            }
          >
            出典の行を追加
          </button>
        )}
      </fieldset>

      <fieldset className="admin-row">
        <legend>確かめた経緯</legend>
        <h2 className="admin-subhead">確認した点</h2>
        {checked.map((item, index) => (
          <div key={index} className="admin-card">
            <label htmlFor={`checked_${index}_claim`}>内容</label>
            <input
              id={`checked_${index}_claim`}
              name={`checked_${index}_claim`}
              value={item.claim}
              onChange={(event) => updateChecked(setChecked, index, { claim: event.target.value })}
            />
            <FieldError messages={errors[`verification.checked[${index}].claim`]} />
            <label htmlFor={`checked_${index}_source_ids`}>出典id（空白区切り）</label>
            <input
              id={`checked_${index}_source_ids`}
              name={`checked_${index}_source_ids`}
              value={item.sourceIds}
              onChange={(event) => updateChecked(setChecked, index, { sourceIds: event.target.value })}
            />
            <FieldError messages={errors[`verification.checked[${index}].source_ids`]} />
            {checked.length > 1 ? (
              <button type="button" className="admin-text-button" onClick={() => setChecked(checked.filter((_, itemIndex) => itemIndex !== index))}>
                この行を外す
              </button>
            ) : null}
          </div>
        ))}
        {checked.length >= MAX_FORM_ROWS ? (
          <p className="admin-hint">確認した点は{MAX_FORM_ROWS}件までです。</p>
        ) : (
          <button type="button" onClick={() => setChecked([...checked, { claim: "", sourceIds: "" }])}>
            確認した点を追加
          </button>
        )}

        <h2 className="admin-subhead">確認できず外した点</h2>
        {removed.map((item, index) => (
          <div key={index} className="admin-card">
            <label htmlFor={`removed_${index}_claim`}>内容</label>
            <input
              id={`removed_${index}_claim`}
              name={`removed_${index}_claim`}
              value={item.claim}
              onChange={(event) => updateRemoved(setRemoved, index, { claim: event.target.value })}
            />
            <FieldError messages={errors[`verification.removed[${index}].claim`]} />
            <label htmlFor={`removed_${index}_reason`}>理由（任意）</label>
            <input
              id={`removed_${index}_reason`}
              name={`removed_${index}_reason`}
              value={item.reason}
              onChange={(event) => updateRemoved(setRemoved, index, { reason: event.target.value })}
            />
            <button type="button" className="admin-text-button" onClick={() => setRemoved(removed.filter((_, itemIndex) => itemIndex !== index))}>
              この行を外す
            </button>
          </div>
        ))}
        {removed.length >= MAX_FORM_ROWS ? (
          <p className="admin-hint">外した点は{MAX_FORM_ROWS}件までです。</p>
        ) : (
          <button type="button" onClick={() => setRemoved([...removed, { claim: "", reason: "" }])}>
            外した点を追加
          </button>
        )}
        <FieldError messages={errors.verification} />
      </fieldset>

      <div className="admin-row">
        <label htmlFor="related">関連する記事の slug</label>
        <textarea id="related" name="related" value={related} rows={3} spellCheck={false} onChange={(event) => setRelated(event.target.value)} />
        <p className="admin-hint">1行に1つ。空でも保存できます。</p>
        <FieldError messages={errors.related} />
      </div>

      {published ? (
        <fieldset className="admin-row">
          <legend>公開済みの保存</legend>
          <p className="admin-hint">訂正か軽微な修正を選びます。メモはどちらも必須です。訂正は履歴に残ります。</p>
          <label className="admin-check">
            <input
              type="radio"
              name="change_kind"
              value="correction"
              checked={changeKind === "correction"}
              onChange={() => setChangeKind("correction")}
            />
            訂正
          </label>
          <label className="admin-check">
            <input
              type="radio"
              name="change_kind"
              value="update"
              checked={changeKind === "update"}
              onChange={() => setChangeKind("update")}
            />
            軽微な修正
          </label>
          <FieldError messages={errors.change_type} />
          <label htmlFor="change_note">メモ</label>
          <textarea id="change_note" name="change_note" value={changeNote} rows={3} onChange={(event) => setChangeNote(event.target.value)} />
          <FieldError messages={errors.change_note} />
        </fieldset>
      ) : null}

      <FormButtons mode={mode} status={draft.status} />

      {state.preview ? (
        <div id="admin-preview" className="admin-preview" tabIndex={-1}>
          <h2>プレビュー</h2>
          <ArticleDocument article={state.preview} embedded />
        </div>
      ) : null}
    </form>
  );
}

function updateSource(
  setSources: Dispatch<SetStateAction<SourceDraft[]>>,
  index: number,
  patch: Partial<SourceDraft>,
) {
  setSources((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
}

function updateChecked(
  setChecked: Dispatch<SetStateAction<CheckedDraft[]>>,
  index: number,
  patch: Partial<CheckedDraft>,
) {
  setChecked((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
}

function updateRemoved(
  setRemoved: Dispatch<SetStateAction<RemovedDraft[]>>,
  index: number,
  patch: Partial<RemovedDraft>,
) {
  setRemoved((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
}
