import { createFileRoute } from "@tanstack/react-router";
import { ControlWidget } from "@/components/control-widget";

export const Route = createFileRoute("/widget")({ component: ControlWidget });
