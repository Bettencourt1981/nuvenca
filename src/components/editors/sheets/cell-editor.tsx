"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { functionNames } from "@/lib/editors/sheets/formula/functions";

export type CommitMove = "down" | "up" | "right" | "left" | null;

let cachedNames: string[] | null = null;
const allFunctions = () => (cachedNames ??= functionNames());

/** The function name being typed at the end of a formula, e.g. "=SU" → "SU". */
function partialFunction(text: string, caret: number): string | null {
  if (!text.startsWith("=")) return null;
  const before = text.slice(0, caret);
  const match = /(?:^=|[(,;+\-*/^&=<> ])([A-Za-z][A-Za-z0-9.]*)$/.exec(before);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Text input used both in the cell and in the formula bar. Typing a function
 * name suggests matching functions (Tab or Enter to complete).
 */
export function FormulaInput({
  value,
  onChange,
  onCommit,
  onCancel,
  className,
  autoFocus,
  inputRef,
  ariaLabel,
  multiline = true,
}: {
  value: string;
  onChange: (value: string) => void;
  onCommit: (move: CommitMove) => void;
  onCancel: () => void;
  className?: string;
  autoFocus?: boolean;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  ariaLabel: string;
  multiline?: boolean;
}) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? localRef;
  const [caret, setCaret] = useState(value.length);
  const [highlight, setHighlight] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const partial = partialFunction(value, caret);
  const suggestions = useMemo(
    () => (partial && partial !== dismissed ? allFunctions().filter((name) => name.startsWith(partial)).slice(0, 8) : []),
    [partial, dismissed],
  );

  useLayoutEffect(() => {
    if (!autoFocus) return;
    const element = ref.current;
    if (!element) return;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, [autoFocus, ref]);

  // Grow with the content.
  useEffect(() => {
    const element = ref.current;
    if (!element || !multiline) return;
    element.style.width = "0px";
    element.style.height = "0px";
    element.style.width = `${element.scrollWidth + 4}px`;
    element.style.height = `${element.scrollHeight}px`;
  }, [value, ref, multiline]);

  const complete = (name: string) => {
    const element = ref.current;
    const at = element?.selectionStart ?? value.length;
    const start = at - (partial?.length ?? 0);
    const next = `${value.slice(0, start)}${name}(${value.slice(at)}`;
    onChange(next);
    requestAnimationFrame(() => {
      const position = start + name.length + 1;
      element?.setSelectionRange(position, position);
      setCaret(position);
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setHighlight((h) => (h + (event.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length);
        return;
      }
      if (event.key === "Tab" || (event.key === "Enter" && !event.altKey)) {
        event.preventDefault();
        complete(suggestions[Math.min(highlight, suggestions.length - 1)]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissed(partial);
        return;
      }
    }
    if (event.key === "Enter" && (event.altKey || (event.ctrlKey && multiline))) {
      // New line inside the cell.
      event.preventDefault();
      const element = event.currentTarget;
      const at = element.selectionStart;
      onChange(`${value.slice(0, at)}\n${value.slice(element.selectionEnd)}`);
      requestAnimationFrame(() => element.setSelectionRange(at + 1, at + 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      onCommit(event.shiftKey ? "up" : "down");
    } else if (event.key === "Tab") {
      event.preventDefault();
      onCommit(event.shiftKey ? "left" : "right");
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
    event.stopPropagation();
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        aria-label={ariaLabel}
        rows={1}
        spellCheck={false}
        onChange={(event) => {
          onChange(event.target.value);
          setCaret(event.target.selectionStart);
          setHighlight(0);
        }}
        onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
        onKeyDown={onKeyDown}
        className={className}
      />
      {suggestions.length > 0 ? (
        <ul
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 min-w-48 rounded-lg border border-border bg-surface py-1 text-sm shadow-lg"
          onMouseDown={(event) => event.preventDefault()}
        >
          {suggestions.map((name, index) => (
            <li
              key={name}
              role="option"
              aria-selected={index === highlight}
              onClick={() => complete(name)}
              className={`cursor-pointer px-3 py-1 font-mono text-xs ${index === highlight ? "bg-primary-soft text-primary" : "text-foreground"}`}
            >
              {name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
