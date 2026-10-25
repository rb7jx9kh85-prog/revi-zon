"use client";

import { useActionState } from "react";
import { updateProfile, type ProfileFormState } from "./actions";

const LEVELS = ["Collège", "Lycée / Gymnase", "Prépa", "Université / Haute école", "Formation pro", "Autre"];

export function ProfileForm({ displayName, schoolLevel }: { displayName: string; schoolLevel: string }) {
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(updateProfile, null);

  return (
    <form action={action} className="stack">
      <label htmlFor="display_name">
        Prénom
        <input id="display_name" name="display_name" defaultValue={displayName} maxLength={80} autoComplete="given-name" />
      </label>
      <label htmlFor="school_level">
        Niveau d'études
        <select id="school_level" name="school_level" defaultValue={schoolLevel}>
          <option value="">Choisir…</option>
          {LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer"}
      </button>
      {state && <p className={`notice ${state.ok ? "ok" : "error"}`}>{state.message}</p>}
    </form>
  );
}
