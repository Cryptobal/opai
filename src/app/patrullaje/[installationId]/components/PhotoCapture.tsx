"use client";

import { useRef } from "react";

interface Props {
  onCaptured: (file: File) => void;
}

export function PhotoCapture({ onCaptured }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const trigger = () => inputRef.current?.click();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onCaptured(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleChange}
      />
      <button onClick={trigger} className="contents" aria-label="Tomar foto" />
    </>
  );
}
