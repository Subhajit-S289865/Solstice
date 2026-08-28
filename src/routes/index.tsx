import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Widget } from "@/routes/widget";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const widget = typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("widget") === "1";
  return widget ? <Widget /> : <AppShell />;
}
