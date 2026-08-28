import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";

const APP_NAME = "Aleya";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "description", content: "Windows wallpaper studio for photos, GIFs, and live video." },
      { name: "theme-color", content: "#0c0c0e" },
    ],
    links: [{ rel: "icon", type: "image/png", href: "/favicon.png" }, { rel: "stylesheet", href: appCss }],
  }),
  component: Root,
});

function Root() {
  // The control widget is a second, independent Tauri WebView. Do not boot the
  // main app's preview bridge or auth/database providers inside it: those are
  // designed for the primary window and can prevent a secondary WebView from
  // painting, which was the cause of the blank/white widget window.
  const isWidget = typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("widget") === "1";
  return (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head><HeadContent /></head>
      <body>
        {isWidget ? <Outlet /> : <><PreviewHostBridge /><AuthProvider><Outlet /></AuthProvider></>}
        <Scripts />
      </body>
    </html>
  );
}
