"use client";

import { useId, useLayoutEffect, useSyncExternalStore } from "react";

import "./reading-settings.css";

const STORAGE_KEY = "good-doomscroller:reading:v1";
const SIZE_STEPS = [90, 100, 115, 130, 150] as const;
const FONT_CHOICES = [
  { value: "classic", label: "Classic serif" },
  { value: "book", label: "Book serif" },
  { value: "sans", label: "Simple sans" },
] as const;

type ReadingPreferences = {
  font: (typeof FONT_CHOICES)[number]["value"];
  size: (typeof SIZE_STEPS)[number];
};

const DEFAULTS: ReadingPreferences = { font: "classic", size: 100 };
const listeners = new Set<() => void>();
let cachedValue: string | null | undefined;
let cachedPreferences = DEFAULTS;
let sessionPreferences: ReadingPreferences | null = null;

function parsePreferences(value: string | null): ReadingPreferences {
  if (!value) return DEFAULTS;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || !("version" in parsed) || parsed.version !== 1) {
      return DEFAULTS;
    }
    const stored = parsed as Record<string, unknown>;
    const font = FONT_CHOICES.find((choice) => choice.value === stored.font)?.value ?? DEFAULTS.font;
    const requestedSize = typeof stored.size === "number" && Number.isFinite(stored.size)
      ? stored.size
      : DEFAULTS.size;
    const size = SIZE_STEPS.reduce((closest, candidate) =>
      Math.abs(candidate - requestedSize) < Math.abs(closest - requestedSize) ? candidate : closest,
    );
    return { font, size };
  } catch {
    return DEFAULTS;
  }
}

function getPreferences() {
  if (sessionPreferences) return sessionPreferences;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value !== cachedValue) {
      cachedValue = value;
      cachedPreferences = parsePreferences(value);
    }
    return cachedPreferences;
  } catch {
    return cachedPreferences;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      sessionPreferences = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function savePreferences(preferences: ReadingPreferences, reset = false) {
  // Retain a working preference for this tab when browser storage is unavailable.
  sessionPreferences = preferences;
  try {
    if (reset) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...preferences }));
    sessionPreferences = null;
  } catch {
    // Private browsing and storage policies must not prevent changing the text.
  }
  listeners.forEach((listener) => listener());
}

const getServerPreferences = () => null;

export function ReadingSettings() {
  const fontId = useId();
  const settings = useSyncExternalStore(subscribe, getPreferences, getServerPreferences);
  const preferences = settings ?? DEFAULTS;
  const sizeIndex = SIZE_STEPS.indexOf(preferences.size);

  useLayoutEffect(() => {
    if (!settings) return;
    document.documentElement.dataset.readingFont = settings.font;
    document.documentElement.style.setProperty("--reading-scale", String(settings.size / 100));
  }, [settings]);

  return (
    <fieldset className="reading-settings" disabled={!settings}>
      <legend>Reading style</legend>
      <div className="reading-settings-controls">
        <div className="reading-font-control">
          <label htmlFor={fontId}>Font</label>
          <select
            id={fontId}
            value={preferences.font}
            onChange={(event) => {
              const font = FONT_CHOICES.find((choice) => choice.value === event.target.value)?.value;
              if (font) savePreferences({ ...preferences, font });
            }}
          >
            {FONT_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>{choice.label}</option>
            ))}
          </select>
        </div>
        <div className="reading-size-control" role="group" aria-label="Text size">
          <button
            type="button"
            aria-label="Decrease text size"
            disabled={sizeIndex === 0}
            onClick={() => savePreferences({ ...preferences, size: SIZE_STEPS[sizeIndex - 1] })}
          >
            <span aria-hidden="true">A−</span>
          </button>
          <output aria-live="polite" aria-label="Current text size">{preferences.size}%</output>
          <button
            type="button"
            aria-label="Increase text size"
            disabled={sizeIndex === SIZE_STEPS.length - 1}
            onClick={() => savePreferences({ ...preferences, size: SIZE_STEPS[sizeIndex + 1] })}
          >
            <span aria-hidden="true">A+</span>
          </button>
        </div>
        <button
          className="reading-reset"
          type="button"
          aria-label="Reset reading style"
          disabled={preferences.font === DEFAULTS.font && preferences.size === DEFAULTS.size}
          onClick={() => savePreferences(DEFAULTS, true)}
        >
          Reset
        </button>
      </div>
    </fieldset>
  );
}
