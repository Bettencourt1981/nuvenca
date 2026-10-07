"use client";

import type { ComponentProps, ReactNode } from "react";
import { DropdownMenu as Menu } from "radix-ui";
import { cn } from "@/lib/utils";

export const DropdownMenu = Menu.Root;
export const DropdownTrigger = Menu.Trigger;

export function DropdownContent({
  children,
  className,
  align = "end",
  ...props
}: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        align={align}
        sideOffset={6}
        collisionPadding={8}
        className={cn(
          "z-50 min-w-52 rounded-xl border border-border bg-surface p-1.5 shadow-lg focus:outline-none",
          className,
        )}
        {...props}
      >
        {children}
      </Menu.Content>
    </Menu.Portal>
  );
}

export function DropdownItem({
  icon,
  children,
  danger,
  className,
  ...props
}: ComponentProps<typeof Menu.Item> & { icon?: ReactNode; danger?: boolean }) {
  return (
    <Menu.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none",
        "data-[highlighted]:bg-surface-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        danger ? "text-danger" : "text-foreground",
        className,
      )}
      {...props}
    >
      {icon ? <span className="flex size-4 items-center justify-center text-muted [&>svg]:size-4">{icon}</span> : null}
      {children}
    </Menu.Item>
  );
}

export function DropdownSeparator() {
  return <Menu.Separator className="my-1 h-px bg-border" />;
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return <Menu.Label className="px-3 py-1.5 text-xs font-medium text-muted">{children}</Menu.Label>;
}
