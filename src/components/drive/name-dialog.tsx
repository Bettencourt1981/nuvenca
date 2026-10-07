"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

/** Dialog with a single name field, used for "New folder" and "Rename". */
export function NameDialog({
  open,
  onOpenChange,
  title,
  label,
  initialValue,
  submitLabel,
  selectBaseName = false,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  label: string;
  initialValue: string;
  submitLabel: string;
  /** Pre-select the name without its extension (for renaming files). */
  selectBaseName?: boolean;
  /** Return an error message to keep the dialog open. */
  onSubmit: (value: string) => Promise<string | null>;
}) {
  const t = useTranslations("common");
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Callers mount this dialog only while it is open, so state starts fresh.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      const dot = initialValue.lastIndexOf(".");
      input.setSelectionRange(0, selectBaseName && dot > 0 ? dot : initialValue.length);
    });
    return () => cancelAnimationFrame(frame);
  }, [open, initialValue, selectBaseName]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const message = await onSubmit(value.trim());
            if (message) setError(message);
            else onOpenChange(false);
          });
        }}
      >
        <Label htmlFor="name-dialog-input" className="sr-only">
          {label}
        </Label>
        <Input
          id="name-dialog-input"
          ref={inputRef}
          value={value}
          maxLength={255}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={Boolean(error)}
          required
        />
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button type="submit" disabled={pending || !value.trim()}>
            {pending ? <Spinner /> : null}
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
