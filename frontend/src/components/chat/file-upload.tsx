"use client";

import { useRef, useState, useCallback } from "react";
import { Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiUpload } from "@/lib/api-client";
import type { UploadedFile } from "@/types";

interface FileUploadProps {
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
}

export function FileUpload({ files, onFilesChange }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList) return;

      setUploading(true);
      try {
        const newFiles: UploadedFile[] = [];
        for (const file of Array.from(fileList)) {
          const result = await apiUpload(file);
          newFiles.push(result);
        }
        onFilesChange([...files, ...newFiles]);
      } catch (err) {
        console.error("Upload failed:", err);
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [files, onFilesChange],
  );

  const removeFile = (idx: number) => {
    onFilesChange(files.filter((_, i) => i !== idx));
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.md,.csv,.json,.pdf"
        multiple
        className="hidden"
        onChange={handleUpload}
      />
      <Button
        variant="ghost"
        size="icon"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        title="Attach files"
      >
        <Paperclip className={`h-4 w-4 ${uploading ? "animate-pulse" : ""}`} />
      </Button>
      {files.map((f, i) => (
        <Badge key={i} variant="secondary" className="gap-1 pr-1">
          <span className="max-w-[100px] truncate text-[10px]">
            {f.filename}
          </span>
          <button
            onClick={() => removeFile(i)}
            className="ml-1 rounded-full p-0.5 hover:bg-background/50"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
    </div>
  );
}
