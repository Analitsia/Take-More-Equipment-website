"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CONDITION_GRADES,
  GRADE_GUIDANCE,
  canSeeCosts,
  publishChecklist,
  isLiveStage,
  STAGES,
  rands,
  type AppRole,
  type ItemStatus,
} from "@takemore/core";
import {
  Button,
  Field,
  Input,
  Panel,
  RandInput,
  Select,
  Textarea,
  ChipGroup,
  PUBLIC_FIELD_HALO,
} from "@takemore/ui";
import { StatusPill, PublishPill } from "@takemore/ui";
import { setStage, setTags, updateItem, type ItemPatch } from "../actions";
import MediaManager from "./MediaManager";
import CostsPanel from "./CostsPanel";

/**
 * The item editor.
 *
 * Autosaves. A warehouse phone loses signal mid-form and a worker who has just
 * typed twelve fields will not type them again, so every field commits on blur
 * rather than waiting for a Save button that may never be reached.
 *
 * Save state is shown, never blocking: the form stays usable while a write is
 * in flight. The one thing that does interrupt is an error, because a silently
 * dropped edit is worse than an interruption.
 */

type Item = Record<string, any>;

export default function ItemEditor({
  item,
  categories,
  subcategories,
  tags,
  costs,
  economics,
  activity,
  role,
}: {
  item: Item;
  categories: { id: string; name: string; slug: string }[];
  subcategories: { id: string; name: string; slug: string; category_id: string }[];
  tags: { id: string; name: string; slug: string }[];
  costs: any[];
  economics: any;
  activity: any[];
  role: AppRole;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Dimensions are stored in millimetres and typed in centimetres — the same
  // arrangement money has here, where the database holds cents and every screen
  // shows rands. A tape measure in a warehouse reads centimetres; millimetres
  // keep the column an integer and let the form take a half-centimetre.
  const toCm = (mm: number | null | undefined) =>
    mm === null || mm === undefined ? "" : String(mm / 10);
  const toMm = (cm: string) => (cm === "" ? null : Math.round(Number(cm) * 10));

  const [form, setForm] = useState({
    title: item.title ?? "",
    brand: item.brand ?? "",
    model: item.model ?? "",
    category_id: item.category_id ?? "",
    subcategory_id: item.subcategory_id ?? "",
    condition_grade: item.condition_grade ?? "",
    description: item.description ?? "",
    capacity: item.capacity ?? "",
    power: item.power ?? "",
    width_cm: toCm(item.width_mm),
    depth_cm: toCm(item.depth_mm),
    height_cm: toCm(item.height_mm),
    weight_kg: item.weight_kg ?? "",
    location_code: item.location_code ?? "",
  });

  /** Only the subcategories belonging to the category currently chosen. */
  const subcategoryOptions = subcategories.filter(
    (s) => s.category_id === form.category_id
  );

  const [listPrice, setListPrice] = useState<number | null>(item.list_price_cents ?? null);
  const [retailPrice, setRetailPrice] = useState<number | null>(item.retail_price_cents ?? null);
  const [notes, setNotes] = useState<string[]>(item.workshop_notes ?? []);
  const [selectedTags, setSelectedTags] = useState<string[]>(
    (item.tags ?? []).map((t: any) => t.tag_id)
  );
  const [mediaCount, setMediaCount] = useState((item.media ?? []).length);

  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  const save = useCallback(
    async (patch: ItemPatch) => {
      setSaveState("saving");
      setError(null);
      const result = await updateItem(item.id, patch);
      if (result.ok) {
        setSaveState("saved");
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaveState("idle"), 1800);
      } else {
        setSaveState("error");
        setError(result.error);
      }
    },
    [item.id]
  );

  /** Commit a text field on blur, but only if it actually changed. */
  const commit = (key: keyof typeof form, transform?: (v: string) => any) => ({
    value: (form as any)[key],
    onChange: (e: any) => setForm((f) => ({ ...f, [key]: e.target.value })),
    onBlur: () => {
      const raw = (form as any)[key];
      const original = item[key] ?? "";
      if (String(raw) === String(original)) return;
      const value = transform ? transform(raw) : raw === "" ? null : raw;
      save({ [key]: value } as ItemPatch);
    },
  });

  const toNumber = (v: string) => (v === "" ? null : Number(v));

  /**
   * Centimetres in the box, millimetres in the column.
   *
   * Needs its own committer rather than commit()'s transform hook because the
   * two sides are in different units: the comparison that decides whether
   * anything actually changed has to happen after the conversion, or every blur
   * writes.
   */
  const commitCm = (key: "width_cm" | "depth_cm" | "height_cm") => {
    const column = key.replace("_cm", "_mm") as "width_mm" | "depth_mm" | "height_mm";
    return {
      value: form[key],
      onChange: (e: any) => setForm((f) => ({ ...f, [key]: e.target.value })),
      onBlur: () => {
        const mm = toMm(form[key]);
        if (mm === (item[column] ?? null)) return;
        save({ [column]: mm } as ItemPatch);
      },
    };
  };

  // The two fixed cost boxes. Held here rather than in CostsPanel so the publish
  // checklist below can react to them as they are typed.
  const costOf = (kind: string) =>
    costs.find((c: any) => c.kind === kind)?.amount_cents ?? null;
  const [auctionCents, setAuctionCents] = useState<number | null>(costOf("auction"));
  const [workshopCents, setWorkshopCents] = useState<number | null>(costOf("workshop"));

  const candidate = useMemo(
    () => ({
      title: form.title,
      description: form.description,
      categoryId: form.category_id || null,
      grade: form.condition_grade || null,
      listPriceCents: listPrice,
      photoCount: mediaCount,
    }),
    [form, listPrice, mediaCount]
  );

  // Drawn only as an explanation of why a live-stage machine is not live yet.
  // Nothing gates on it in the UI any more — the stage button attempts the
  // publish and the database's own gate decides.
  const checklist = useMemo(() => publishChecklist(candidate), [candidate]);

  // Whether this stage wants the machine on the site at all — which is what
  // decides between "not live yet, here is what is missing" and "off the site,
  // and that is correct".
  const liveStage = isLiveStage(item.status as ItemStatus);

  async function onStatus(next: ItemStatus) {
    setError(null);
    setNotice(null);
    const result = await setStage(item.id, next);
    if (!result.ok) return setError(result.error);
    // The stage change also puts the machine on or off the website, which is a
    // thing that happened without anyone asking — so it is said out loud.
    if (result.notice) setNotice(result.notice);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-medium tracking-tight truncate">
            {form.title || "Untitled item"}
          </h1>
          <p className="text-xs font-light text-muted mt-1">
            {item.sku} · created{" "}
            {new Date(item.created_at).toLocaleDateString("en-ZA", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={item.status} />
          <PublishPill publishedAt={item.published_at} />
          <span
            className={`text-[11px] font-light transition-opacity ${
              saveState === "idle" ? "opacity-0" : "opacity-100"
            } ${saveState === "error" ? "text-status-sold" : "text-muted"}`}
          >
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
          </span>
        </div>
      </div>

      {error && (
        <div className="text-xs text-status-sold bg-status-sold/10 border border-status-sold/30 rounded-xl px-3 py-2.5">
          {error}
        </div>
      )}

      {notice && (
        <div className="text-xs text-accent bg-accent/10 border border-accent/30 rounded-xl px-3 py-2.5">
          {notice}
        </div>
      )}

      <MediaManager
        itemId={item.id}
        media={item.media ?? []}
        onCountChange={setMediaCount}
      />

      <Panel title="The machine" subtitle="What it is, and what a buyer is looking at.">
        <div className="space-y-4">
          <Field
            label="Title"
            required
            hint={item.published_at ? "URL is locked — this item is live" : "Sets the web address"}
          >
            <Input {...commit("title")} placeholder="6-Grid Combi Steamer" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Brand">
              <Input {...commit("brand")} placeholder="Thermex" />
            </Field>
            <Field label="Model">
              <Input {...commit("model")} placeholder="CS-61" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" required>
              <Select
                value={form.category_id}
                onChange={(e) => {
                  const category_id = e.target.value;
                  setForm((f) => ({ ...f, category_id, subcategory_id: "" }));
                  // Both columns in one patch. Clearing the subcategory is not
                  // tidiness — the composite foreign key refuses a subcategory
                  // belonging to the category we just moved away from, so this
                  // is what makes the write legal at all.
                  save({ category_id: category_id || null, subcategory_id: null });
                }}
              >
                <option value="">Choose…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Subcategory"
              hint={form.category_id ? undefined : "pick a category first"}
            >
              <Select
                value={form.subcategory_id}
                disabled={!form.category_id}
                onChange={(e) => {
                  setForm((f) => ({ ...f, subcategory_id: e.target.value }));
                  save({ subcategory_id: e.target.value || null });
                }}
              >
                <option value="">Choose…</option>
                {subcategoryOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Condition grade" required>
            <Select
              value={form.condition_grade}
              onChange={(e) => {
                setForm((f) => ({ ...f, condition_grade: e.target.value }));
                save({ condition_grade: (e.target.value || null) as any });
              }}
            >
              <option value="">Choose…</option>
              {CONDITION_GRADES.map((g) => (
                <option key={g} value={g}>
                  Grade {g}
                </option>
              ))}
            </Select>
          </Field>

          {/* The grading standard, inline. Two workers on two days should grade
              the same fryer the same way. */}
          {form.condition_grade && (
            <p className="text-[11px] font-light text-muted leading-relaxed bg-background border border-border rounded-xl px-3 py-2.5">
              <span className="text-accent">Grade {form.condition_grade}</span> —{" "}
              {GRADE_GUIDANCE[form.condition_grade as "A" | "B" | "C"]}
            </p>
          )}

          <Field
            label="Description"
            required
            hint={`${form.description.length} characters — aim for ~400`}
          >
            <Textarea
              {...commit("description")}
              placeholder="What it does, what condition it is in, and who it suits."
            />
          </Field>

          <Field label="Tags">
            <ChipGroup
              options={tags.map((t) => ({ value: t.id, label: t.name }))}
              selected={selectedTags}
              onToggle={(id) => {
                const next = selectedTags.includes(id)
                  ? selectedTags.filter((t) => t !== id)
                  : [...selectedTags, id];
                setSelectedTags(next);
                setTags(item.id, next);
              }}
            />
          </Field>
        </div>
      </Panel>

      <Panel title="Specification" subtitle="Capacity and power show on every card.">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Capacity">
              <Input {...commit("capacity")} placeholder="6 × GN 1/1" />
            </Field>
            <Field label="Power">
              <Input {...commit("power")} placeholder="10.2 kW" />
            </Field>
          </div>

          <Field label="Dimensions" hint="width × depth × height, centimetres">
            <div className="grid grid-cols-3 gap-2">
              <Input {...commitCm("width_cm")} inputMode="decimal" placeholder="W" />
              <Input {...commitCm("depth_cm")} inputMode="decimal" placeholder="D" />
              <Input {...commitCm("height_cm")} inputMode="decimal" placeholder="H" />
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Weight" hint="kg — decides delivery">
              <Input {...commit("weight_kg", toNumber)} inputMode="decimal" placeholder="118" />
            </Field>
            <Field label="Shelf" hint="where to find it">
              <Input {...commit("location_code")} placeholder="A-14" />
            </Field>
          </div>
        </div>
      </Panel>

      <Panel title="Price">
        <div className="grid grid-cols-2 gap-3">
          {/* The only figure on this form a buyer will ever read, so it carries a
              faint accent halo — enough that the eye finds it among eight
              identical boxes, not so much that it reads as an error. */}
          <Field label="Asking price" required hint="shows on the website">
            <RandInput
              className={PUBLIC_FIELD_HALO}
              valueCents={listPrice}
              onChangeCents={setListPrice}
              onBlur={() => {
                if (listPrice !== (item.list_price_cents ?? null))
                  save({ list_price_cents: listPrice });
              }}
            />
          </Field>
          <Field label="New price" hint="powers the saving badge">
            <RandInput
              valueCents={retailPrice}
              onChangeCents={setRetailPrice}
              onBlur={() => {
                if (retailPrice !== (item.retail_price_cents ?? null))
                  save({ retail_price_cents: retailPrice });
              }}
            />
          </Field>
        </div>
      </Panel>

      {/* Costs and margin exist only for managers and owners. A staff account
          gets no panel at all rather than an empty one, which would read as
          "this machine cost nothing". */}
      {canSeeCosts(role) && (
        <CostsPanel
          itemId={item.id}
          costs={costs}
          auctionCents={auctionCents}
          workshopCents={workshopCents}
          onFixedCostChange={(kind, cents) =>
            (kind === "auction" ? setAuctionCents : setWorkshopCents)(cents)
          }
          listPriceCents={listPrice}
        />
      )}

      <Panel
        title="Workshop report"
        subtitle="What was actually replaced. This is the proof behind the grade, and it renders on the public page."
      >
        <div className="space-y-2">
          {notes.map((note, index) => (
            <div key={index} className="flex gap-2">
              <Input
                value={note}
                onChange={(e) => {
                  const next = [...notes];
                  next[index] = e.target.value;
                  setNotes(next);
                }}
                onBlur={() => save({ workshop_notes: notes.filter((n) => n.trim()) })}
                placeholder="Door gasket and hinge springs replaced"
              />
              <Button
                variant="ghost"
                onClick={() => {
                  const next = notes.filter((_, i) => i !== index);
                  setNotes(next);
                  save({ workshop_notes: next.filter((n) => n.trim()) });
                }}
                className="shrink-0 px-3"
              >
                <iconify-icon icon="solar:trash-bin-trash-linear" width="16" height="16" noobserver="" />
              </Button>
            </div>
          ))}
          <Button variant="secondary" onClick={() => setNotes([...notes, ""])}>
            <iconify-icon icon="solar:add-circle-linear" width="16" height="16" noobserver="" />
            Add a line
          </Button>
        </div>
      </Panel>

      {/* All four stages, always on screen, current one lit. Nothing is hidden
          behind "what can I do from here" — the answer is always "any of them",
          so the buttons are a picker rather than a list of moves. Tapping the
          stage it is already on is allowed on purpose: that is what retries
          publishing once a missing photo or price has been added. */}
      <Panel
        title="Stage"
        subtitle="Tap any one. The stage decides whether it is on the website."
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {STAGES.map((stage) => {
            const current = item.status === stage.status;
            return (
              <button
                key={stage.status}
                onClick={() => onStatus(stage.status)}
                aria-pressed={current}
                className={`text-left rounded-xl border px-3.5 py-3 transition-colors ${
                  current
                    ? "border-accent/70 bg-accent/10"
                    : "border-border hover:border-white/25"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      stage.live ? "bg-accent" : "bg-muted"
                    }`}
                  />
                  <span
                    className={`text-sm font-medium tracking-tight ${
                      current ? "text-accent" : "text-white/90"
                    }`}
                  >
                    {stage.label}
                  </span>
                </span>
                <span className="block text-[11px] font-light text-muted mt-1 leading-snug">
                  {stage.hint}
                </span>
              </button>
            );
          })}
        </div>
      </Panel>

      {/* No publish button here on purpose. The stage above is the one control,
          and a second switch that could disagree with it is exactly how sold
          machines used to end up still listed. This panel reports what happened
          and, when something is live-stage but not live, says what is missing. */}
      <Panel
        title="The website"
        subtitle={
          item.published_at
            ? "Live now. Move it to Reserved or Sold to take it down."
            : liveStage
              ? "Not live yet — it needs the rest of this list, then tap its stage again."
              : "Off the site, because of the stage it is in."
        }
      >
        <div className="space-y-4">
          {!item.published_at && liveStage && (
            <ul className="space-y-1.5">
              {checklist.map((req) => (
                <li key={req.id} className="flex items-center gap-2 text-sm font-light">
                  <span
                    className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 ${
                      req.met ? "bg-accent text-background" : "border border-border text-muted"
                    }`}
                  >
                    {req.met && (
                      <iconify-icon icon="solar:check-read-linear" width="11" height="11" noobserver="" />
                    )}
                  </span>
                  <span className={req.met ? "text-muted line-through" : "text-white/80"}>
                    {req.label}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {item.published_at && (
              <a
                href={`${process.env.NEXT_PUBLIC_STOREFRONT_URL ?? ""}/stock/${item.slug}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-light text-muted hover:text-accent transition-colors"
              >
                View on site
                <iconify-icon icon="solar:arrow-right-up-linear" width="14" height="14" noobserver="" />
              </a>
            )}

            <label className="flex items-center gap-2 ml-auto text-sm font-light text-white/80 cursor-pointer">
              <input
                type="checkbox"
                checked={item.featured}
                onChange={(e) => save({ featured: e.target.checked })}
                className="w-4 h-4 rounded accent-accent"
              />
              Feature on the homepage
            </label>
          </div>
        </div>
      </Panel>

      {activity.length > 0 && (
        <Panel title="History">
          <ol className="space-y-2.5">
            {activity.map((entry) => (
              <li key={entry.id} className="flex items-baseline gap-3 text-xs font-light">
                <span className="text-muted whitespace-nowrap tabular-nums">
                  {new Date(entry.created_at).toLocaleDateString("en-ZA", {
                    day: "2-digit",
                    month: "short",
                  })}
                </span>
                <span className="text-white/80">{entry.summary ?? entry.action}</span>
              </li>
            ))}
          </ol>
        </Panel>
      )}
    </div>
  );
}
