"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const FONTS = [
  { value: "inter", label: "Inter" },
  { value: "system", label: "System" },
  { value: "mono", label: "Monospace" },
  { value: "serif", label: "Serif" },
] as const;

const STORAGE_KEY = "chatui-font";

export function FontSelector() {
  const [font, setFont] = useState("inter");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setFont(saved);
      document.documentElement.setAttribute("data-font", saved);
    }
  }, []);

  const handleChange = (value: string) => {
    setFont(value);
    localStorage.setItem(STORAGE_KEY, value);
    document.documentElement.setAttribute("data-font", value);
  };

  return (
    <Select value={font} onValueChange={handleChange}>
      <SelectTrigger className="w-[130px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {FONTS.map((f) => (
          <SelectItem key={f.value} value={f.value}>
            {f.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
