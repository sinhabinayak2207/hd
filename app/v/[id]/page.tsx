"use client";

import { use } from "react";
import AuthGate from "@/components/AuthGate";
import Editor from "@/components/Editor";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGate>
      <Editor id={decodeURIComponent(id)} />
    </AuthGate>
  );
}
