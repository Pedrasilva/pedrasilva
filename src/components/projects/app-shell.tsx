interface Props {
  children: React.ReactNode;
  active?: "projects" | "resources" | "tasks" | "timesheet";
}

// Projects sub-nav was merged into the global header (`_app.tsx`).
// AppShell now only provides the content container.
export function AppShell({ children }: Props) {
  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-3.5rem)] bg-background text-foreground sm:-mx-6">
      <main>{children}</main>
    </div>
  );
}
