// Forma del bundle offline (da scoring.bundle). Copia locale dei tipi utili,
// senza accoppiare i componenti al router.

export interface BundleManeuver {
  id: string;
  patternId: string;
  position: number;
  labelIt: string;
  labelEn: string | null;
}

export interface BundlePattern {
  id: string;
  code: string;
  name: string;
  entryGait: string;
}

export interface BundleClass {
  id: string;
  name: string;
  patternId: string;
  eventId: string;
}

export interface BundleEntry {
  id: string;
  classId: string;
  horseId: string;
  riderId: string;
  drawNumber: number | null;
  status: string;
}

export interface BundleRun {
  id: string;
  entryId: string;
  status: string;
}

export interface BundleJudge {
  personId: string;
  fullName: string;
  classId: string | null;
}

export interface ScoringBundle {
  engineVersion: string;
  selfJudgePersonId: string | null;
  classes: BundleClass[];
  patterns: BundlePattern[];
  maneuvers: BundleManeuver[];
  entries: BundleEntry[];
  runs: BundleRun[];
  judges: BundleJudge[];
  // arricchiti localmente
  horses?: Record<string, string>;
  riders?: Record<string, string>;
}

export interface Session {
  token: string;
  eventId: string;
  role: "giudice" | "scribe";
}
