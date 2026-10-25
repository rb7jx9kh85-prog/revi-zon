"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "file" | "text";

// Formats lus par le modèle d'IA (pas de HEIC : demander un export JPG)
const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,text/plain,.pdf,.txt";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

function sourceFor(file: File): "pdf" | "image" | "text" | null {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "pdf";
  if (IMAGE_TYPES.includes(file.type)) return "image";
  if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) return "text";
  return null;
}

function safeFileName(name: string) {
  const cleaned = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(-80);
  return cleaned || "cours";
}

function titleFromFile(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 200) || "Mon cours";
}

export function UploadForm({ userId, maxMb }: { userId: string; maxMb: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function chooseFile(f: File | null) {
    setError(null);
    if (!f) return setFile(null);
    if (!sourceFor(f)) return setError("Format non pris en charge. Importe un PDF, une photo JPG ou PNG, ou un fichier texte.");
    if (f.size > maxMb * 1024 * 1024) return setError(`Ce fichier dépasse la limite de ${maxMb} Mo de ton plan.`);
    setFile(f);
    if (!title) setTitle(titleFromFile(f.name));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let upload: File;
    if (mode === "file") {
      if (!file) return setError("Choisis un fichier à importer.");
      upload = file;
    } else {
      if (text.trim().length < 80) return setError("Colle au moins quelques phrases de ton cours.");
      upload = new File([text], "notes.txt", { type: "text/plain" });
    }
    const source = sourceFor(upload)!;
    const finalTitle = (title.trim() || titleFromFile(upload.name)).slice(0, 200);

    setBusy(true);
    const supabase = createClient();
    const id = crypto.randomUUID();
    const path = `${userId}/${id}/${safeFileName(upload.name)}`;

    const { error: insertError } = await supabase.from("documents").insert({
      id,
      title: finalTitle,
      source,
      storage_path: path,
      mime_type: upload.type || null,
      size_bytes: upload.size,
    });
    if (insertError) {
      setBusy(false);
      return setError(
        insertError.message.includes("Quota")
          ? "Tu as atteint la limite de cours importés ce mois-ci."
          : "L'import a échoué. Réessaie dans un instant.",
      );
    }

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(path, upload, { contentType: upload.type || "application/octet-stream", upsert: false });
    if (uploadError) {
      await supabase.from("documents").delete().eq("id", id);
      setBusy(false);
      return setError("L'envoi du fichier a échoué. Vérifie ta connexion et réessaie.");
    }

    router.push(`/study/${id}`);
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <div className="segmented" role="tablist" aria-label="Type d'import">
        <button type="button" role="tab" aria-selected={mode === "file"} className={mode === "file" ? "on" : ""} onClick={() => setMode("file")}>
          Fichier ou photo
        </button>
        <button type="button" role="tab" aria-selected={mode === "text"} className={mode === "text" ? "on" : ""} onClick={() => setMode("text")}>
          Coller du texte
        </button>
      </div>

      {mode === "file" ? (
        <label
          htmlFor="file"
          className={`dropzone ${dragging ? "drag" : ""} ${file ? "has-file" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            chooseFile(e.dataTransfer.files?.[0] ?? null);
          }}
        >
          <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4" />
          </svg>
          <strong>{file ? file.name : "Glisse ton cours ici ou clique pour choisir"}</strong>
          <span className="muted">PDF, photo (JPG, PNG, WebP) ou texte · {maxMb} Mo max</span>
          <input id="file" type="file" accept={ACCEPT} className="sr-only" onChange={(e) => chooseFile(e.target.files?.[0] ?? null)} />
        </label>
      ) : (
        <label htmlFor="paste">
          Ton cours
          <textarea id="paste" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="Colle ici tes notes ou le texte de ton cours…" />
        </label>
      )}

      <label htmlFor="title">
        Titre
        <input id="title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Biologie, chapitre 3 : la photosynthèse" />
      </label>

      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Import en cours…" : "Créer mon set de révision"}
      </button>
      {error && <p className="notice error">{error}</p>}
    </form>
  );
}
