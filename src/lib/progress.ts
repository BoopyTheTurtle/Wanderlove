const STORAGE_KEY = "wanderclue_progress";

export type StopProgress = {
  completedAt: string;
  photoDataUrl: string;
};

export type Progress = Record<string, StopProgress>;

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Progress) : {};
  } catch {
    return {};
  }
}

export function saveStopProgress(stopId: string, photoDataUrl: string): Progress {
  const progress = loadProgress();
  progress[stopId] = { completedAt: new Date().toISOString(), photoDataUrl };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  return progress;
}

export function resetProgress(): void {
  localStorage.removeItem(STORAGE_KEY);
}
