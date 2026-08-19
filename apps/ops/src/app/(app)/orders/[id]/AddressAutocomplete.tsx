"use client";

import { useEffect, useRef, useState } from "react";
import { Field, Input } from "@takemore/ui";

/**
 * The address field, with Google offering the rest of it.
 *
 * ── It is a text box first, and a picker second ───────────────────────────
 *
 * One line, fully typeable, and the suggestions are a list that opens under it
 * when Google has any. When Google has none — no key, Places not enabled, a
 * smallholding down a dirt road, the API down — nothing opens and the field is
 * an ordinary input. That is why no failure here is an error anybody has to
 * read: the only difference is a list that did not appear.
 *
 * ── The hint earns its place ──────────────────────────────────────────────
 *
 * `searching…` / `no match` in the label's hint slot. Without it, "Google is
 * slow", "Google found nothing" and "this feature is broken" all look identical
 * from the counter — which is exactly the confusion that cost an afternoon the
 * first time this shipped. One word removes it.
 *
 * ── Why a debounce, and why 350ms ─────────────────────────────────────────
 *
 * Every request is billed. Firing on each keystroke would spend a dozen events
 * on one address; waiting until typing pauses spends about four. 350ms is long
 * enough that a normal typing run produces one request and short enough that the
 * list feels like it is keeping up. The in-flight request is aborted when the
 * next one starts, so a slow answer can never overwrite a newer one — the bug
 * that makes a suggestion list flicker back to a stale query.
 *
 * ── Picking is not the same as typing ─────────────────────────────────────
 *
 * `justPicked` suppresses the lookup that the programmatic `onChange` would
 * otherwise trigger. Without it, choosing a suggestion immediately asks Google
 * about the text of the suggestion you just chose: one wasted billed request per
 * address, and a list that reopens under the cursor after every pick.
 */
export default function AddressAutocomplete({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  type Suggestion = { main: string; secondary: string; text: string };

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [state, setState] = useState<
    "idle" | "searching" | "found" | "empty" | "unconfigured" | "down"
  >("idle");

  const justPicked = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (justPicked.current) {
      justPicked.current = false;
      return;
    }

    const query = value.trim();
    if (disabled || query.length < 3) {
      setSuggestions([]);
      setOpen(false);
      setState("idle");
      return;
    }

    setState("searching");

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/places", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: query }),
          signal: controller.signal,
        });
        const data = (await response.json()) as {
          suggestions?: Suggestion[];
          reason?: string;
        };
        const next = data.suggestions ?? [];
        setSuggestions(next);
        setActive(-1);
        setOpen(next.length > 0);

        // An empty list has three very different causes, and collapsing them
        // into one message is what made a missing key look like a suburb
        // Google had never heard of. Each says which it was.
        setState(
          next.length > 0
            ? "found"
            : data.reason === "not-configured"
              ? "unconfigured"
              : data.reason === "unavailable"
                ? "down"
                : "empty"
        );
      } catch (error) {
        // An abort is the ordinary case — a newer keystroke superseded this
        // request — and must not be reported as "nothing found", or the hint
        // flickers to `no match` on every fast typist.
        if ((error as Error)?.name === "AbortError") return;
        setSuggestions([]);
        setOpen(false);
        setState("down");
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [value, disabled]);

  // A click anywhere else means they are done with the list, whether or not
  // they picked from it.
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const pick = (suggestion: Suggestion) => {
    justPicked.current = true;
    onChange(suggestion.text);
    setSuggestions([]);
    setOpen(false);
    setActive(-1);
    setState("idle");
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (event.key === "Enter") {
      // Swallowed whether or not a row is highlighted: this is a one-line field
      // inside a form, and Enter here means "take the obvious one", never
      // "submit the order".
      event.preventDefault();
      pick(suggestions[active >= 0 ? active : 0]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <Field
        label="Where to"
        hint={
          state === "searching"
            ? "searching…"
            : state === "empty"
              ? "no match — type it in full"
              : state === "unconfigured"
                ? "suggestions not set up — type it in full"
                : state === "down"
                  ? "suggestions are down — type it in full"
                  : undefined
        }
      >
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="Start typing — street, suburb"
          autoComplete="off"
          disabled={disabled}
        />
      </Field>

      {open && suggestions.length > 0 && (
        <ul
          className="absolute z-30 left-0 right-0 top-full mt-1 overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-black/50"
          role="listbox"
        >
          {suggestions.map((suggestion, index) => (
            <li key={`${suggestion.text}-${index}`}>
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                // mousedown, not click: the input's blur would otherwise close
                // the list before the click ever lands.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(suggestion);
                }}
                onMouseEnter={() => setActive(index)}
                className={`block w-full px-3 py-2 text-left transition-colors ${
                  index === active ? "bg-accent/10" : "hover:bg-white/5"
                }`}
              >
                <span className="block text-sm font-light text-white/90">
                  {suggestion.main}
                </span>
                {suggestion.secondary && (
                  <span className="block text-[11px] font-light text-muted">
                    {suggestion.secondary}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
