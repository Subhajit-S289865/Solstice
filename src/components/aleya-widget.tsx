import { MonitorUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { native } from "@/lib/native";
import { AleyaMark } from "./aleya-mark";

export function AleyaWidget() {
  return <Button className="fixed bottom-5 right-5 z-50 h-11 gap-2 rounded-full border border-violet-400/30 shadow-2xl" variant="cta" onClick={() => void native.showWidget()}>
    <AleyaMark className="size-7 rounded-full"/>
    <MonitorUp className="size-4"/>
    <span>Control</span>
  </Button>;
}
