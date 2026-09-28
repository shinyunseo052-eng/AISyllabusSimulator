import { useState, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

/* ─── Types ─────────────────────────────────────────────────── */
interface Component {
  id: string;
  name: string;
  weight: number;
  earned: number | null;
  total: number;
  dropGroup?: string;
}
interface Course {
  id: string;
  code: string;
  name: string;
  professor: string;
  credits: number;
  dropLowest: boolean;
  penaltyNote?: string;
  components: Component[];
  parsedFromSyllabus?: boolean;
}

/* ─── Seed data ──────────────────────────────────────────────── */
const INITIAL_COURSES: Course[] = [
  {
    id: "c1",
    code: "ACCTG 2100",
    name: "Financial Accounting",
    professor: "Prof. Kim Sunghee",
    credits: 3,
    dropLowest: false,
    components: [
      { id: "a1",    name: "Assignment 1", weight: 10, earned: 96,   total: 100 },
      { id: "a2",    name: "Assignment 2", weight: 10, earned: 92,   total: 100 },
      { id: "quiz1", name: "Quiz 1",       weight: 10, earned: 90,   total: 100 },
      { id: "mid",   name: "Midterm Exam", weight: 30, earned: 88,   total: 100 },
      { id: "final", name: "Final Exam",   weight: 40, earned: null, total: 100 },
    ],
  },
  {
    id: "c2",
    code: "MGT 1030",
    name: "Responsibilities of Business",
    professor: "Prof. Hak-Yoon Kim",
    credits: 3,
    dropLowest: false,
    penaltyNote: "3+ absences → −5 pts from final grade",
    components: [
      { id: "r1",     name: "Reflection Paper 1", weight: 15, earned: 95,   total: 100 },
      { id: "r2",     name: "Reflection Paper 2", weight: 15, earned: 88,   total: 100 },
      { id: "grp",    name: "Group Project",       weight: 20, earned: null, total: 100 },
      { id: "mid2",   name: "Midterm Exam",        weight: 20, earned: 91,   total: 100 },
      { id: "final2", name: "Final Exam",          weight: 30, earned: null, total: 100 },
    ],
  },
  {
    id: "c3",
    code: "IS 2010",
    name: "Spreadsheet Analysis",
    professor: "Prof. Byoung-gyu Gong",
    credits: 2,
    dropLowest: true,
    components: [
      { id: "lab1",   name: "Lab 1",         weight: 15, earned: 100,  total: 100, dropGroup: "lab" },
      { id: "lab2",   name: "Lab 2",         weight: 15, earned: 93,   total: 100, dropGroup: "lab" },
      { id: "lab3",   name: "Lab 3",         weight: 15, earned: 82,   total: 100, dropGroup: "lab" },
      { id: "proj",   name: "Final Project", weight: 25, earned: null, total: 100 },
      { id: "final3", name: "Final Exam",    weight: 30, earned: null, total: 100 },
    ],
  },
];

/* ─── Grade scale ────────────────────────────────────────────── */
const GRADES = [
  { label: "A+", min: 95, gpa: 4.5 },
  { label: "A",  min: 90, gpa: 4.0 },
  { label: "A-", min: 87, gpa: 3.7 },
  { label: "B+", min: 83, gpa: 3.5 },
  { label: "B",  min: 80, gpa: 3.0 },
  { label: "B-", min: 77, gpa: 2.7 },
  { label: "C+", min: 73, gpa: 2.5 },
  { label: "C",  min: 70, gpa: 2.0 },
  { label: "D",  min: 60, gpa: 1.0 },
  { label: "F",  min: 0,  gpa: 0.0 },
];

const GRADE_COLORS: Record<string, string> = {
  "A+": "#0a7c43", "A": "#15803d", "A-": "#16a34a",
  "B+": "#1d4ed8", "B": "#2563eb", "B-": "#3b82f6",
  "C+": "#b45309", "C": "#d97706",
  "D": "#dc2626",  "F": "#991b1b",
};
const BAR_COLORS = ["#e05a3a", "#3b82f6", "#22c55e"];
const ACCENT = "#e05a3a";

function gradeFor(pct: number) {
  return GRADES.find((g) => pct >= g.min) ?? GRADES[GRADES.length - 1];
}

/* ─── Drop-lowest ────────────────────────────────────────────── */
function applyDropLowest(course: Course, scores: Record<string, number>): Record<string, number> {
  if (!course.dropLowest) return scores;
  const grouped: Record<string, { id: string; pct: number }[]> = {};
  for (const c of course.components) {
    const g = c.dropGroup ?? "__none__";
    const score = scores[c.id];
    if (score === undefined) continue;
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push({ id: c.id, pct: (score / c.total) * 100 });
  }
  const dropped = new Set<string>();
  for (const [group, items] of Object.entries(grouped)) {
    if (group === "__none__" || items.length < 2) continue;
    dropped.add(items.reduce((a, b) => (a.pct < b.pct ? a : b)).id);
  }
  const result: Record<string, number> = {};
  for (const [id, val] of Object.entries(scores)) {
    if (!dropped.has(id)) result[id] = val;
  }
  return result;
}

/* ─── Core math ──────────────────────────────────────────────── */
function buildScores(course: Course, inputs: Record<string, string>): Record<string, number> {
  const raw: Record<string, number> = {};
  for (const c of course.components) {
    if (c.earned !== null) { raw[c.id] = c.earned; continue; }
    const v = parseFloat(inputs[c.id] ?? "");
    if (!isNaN(v)) raw[c.id] = v;
  }
  return applyDropLowest(course, raw);
}

function computeProjected(course: Course, inputs: Record<string, string>): number | null {
  const scores = buildScores(course, inputs);
  let ws = 0, tw = 0;
  for (const c of course.components) {
    const s = scores[c.id];
    if (s === undefined) continue;
    ws += (s / c.total) * 100 * c.weight;
    tw += c.weight;
  }
  return tw > 0 ? ws / tw : null;
}

function requiredOn(
  course: Course,
  targetPct: number,
  compId: string,
  inputs: Record<string, string>,
  assumeOtherPending = 100
): number {
  let fixed = 0, fixedW = 0, targetW = 0;
  const unsetPending: Component[] = [];
  for (const c of course.components) {
    if (c.id === compId) { targetW = c.weight; continue; }
    if (c.earned !== null) {
      fixed += (c.earned / c.total) * 100 * c.weight;
      fixedW += c.weight;
    } else {
      const v = parseFloat(inputs[c.id] ?? "");
      if (!isNaN(v)) { fixed += (v / c.total) * 100 * c.weight; fixedW += c.weight; }
      else unsetPending.push(c);
    }
  }
  for (const c of unsetPending) {
    fixed += (assumeOtherPending / c.total) * 100 * c.weight;
    fixedW += c.weight;
  }
  if (targetW === 0) return NaN;
  return (targetPct * (fixedW + targetW) - fixed) / targetW;
}

function safetyRange(course: Course, inputs: Record<string, string>) {
  const scores = buildScores(course, inputs);
  let fixedWS = 0, fixedW = 0, pendingW = 0;
  for (const c of course.components) {
    const s = scores[c.id];
    if (s !== undefined) {
      fixedWS += (s / c.total) * 100 * c.weight;
      fixedW += c.weight;
    } else {
      pendingW += c.weight;
    }
  }
  const totalW = fixedW + pendingW;
  return {
    minPct: totalW > 0 ? fixedWS / totalW : 0,
    maxPct: totalW > 0 ? (fixedWS + pendingW * 100) / totalW : 0,
  };
}

/* ─── PDF + AI ───────────────────────────────────────────────── */
async function extractPdfText(file: File): Promise<string> {
  const ab = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 8); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((x: any) => x.str).join(" "));
  }
  return pages.join("\n");
}

async function parseSyllabus(text: string, apiKey: string): Promise<Partial<Course>> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5-20251101",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `Extract grading from this syllabus. Return ONLY valid JSON:
{"code":"CS 101","name":"course name","professor":"Prof. Name","credits":3,"dropLowest":false,"penaltyNote":null,"components":[{"id":"uid","name":"Component Name","weight":20,"total":100}]}
Weights must sum to 100. Syllabus:\n${text.slice(0, 6000)}`,
      }],
    }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any)?.error?.message ?? `API ${res.status}`); }
  const data = await res.json();
  const parsed = JSON.parse(data.content[0].text.replace(/```json|```/g, "").trim());
  return {
    ...parsed,
    components: parsed.components.map((c: any) => ({ ...c, earned: null, total: c.total ?? 100 })),
  };
}

/* ─── Upload Modal ───────────────────────────────────────────── */
function UploadModal({ courseId, onClose, onParsed }: {
  courseId: string;
  onClose: () => void;
  onParsed: (id: string, data: Partial<Course>) => void;
}) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("gp_key") ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    if (f.type !== "application/pdf") { setError("PDF files only."); return; }
    setFile(f); setError("");
  };

  const parse = async () => {
    if (!file || !apiKey.trim()) { setError("Select a PDF and enter your API key."); return; }
    localStorage.setItem("gp_key", apiKey.trim());
    setStatus("working"); setError("");
    try {
      const text = await extractPdfText(file);
      const data = await parseSyllabus(text, apiKey.trim());
      onParsed(courseId, data);
      setStatus("done");
      setTimeout(onClose, 1000);
    } catch (e: any) { setError(e.message); setStatus("error"); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, backdropFilter: "blur(2px)" }}>
      <div style={{ background: "#fff", borderRadius: 18, padding: 28, width: 420, boxShadow: "0 24px 80px rgba(0,0,0,0.14)", border: "1px solid #ebebeb" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>AI Syllabus Parser</div>
            <div style={{ fontSize: 12, color: "#aaa", marginTop: 2 }}>Extracts grading weights and hidden rules automatically</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 20, color: "#bbb", cursor: "pointer" }}>×</button>
        </div>

        <label style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 5 }}>Anthropic API Key</label>
        <input type="password" placeholder="sk-ant-..." value={apiKey} onChange={(e) => setApiKey(e.target.value)}
          style={{ width: "100%", padding: "8px 12px", border: "1px solid #e4e4e4", borderRadius: 8, fontSize: 13, fontFamily: "DM Mono, monospace", outline: "none", marginBottom: 14, boxSizing: "border-box" }} />

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => ref.current?.click()}
          style={{ border: `2px dashed ${dragging ? ACCENT : file ? "#16a34a" : "#e0e0e0"}`, borderRadius: 12, padding: "28px 20px", textAlign: "center", cursor: "pointer", marginBottom: 12, background: file ? "#f0fdf4" : "#fafafa" }}>
          <input ref={ref} type="file" accept=".pdf" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          <div style={{ fontSize: 28, marginBottom: 6 }}>{file ? "✓" : "📄"}</div>
          <div style={{ fontSize: 13, color: file ? "#15803d" : "#888", fontWeight: file ? 600 : 400 }}>
            {file ? file.name : "Drop syllabus PDF here or click to browse"}
          </div>
        </div>

        {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "9px 14px", fontSize: 12, color: "#dc2626", marginBottom: 10 }}>{error}</div>}
        {status === "done" && <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "9px 14px", fontSize: 12, color: "#15803d", marginBottom: 10 }}>✓ Parsed and applied.</div>}

        <button onClick={parse} disabled={status === "working"}
          style={{ width: "100%", padding: 12, background: status === "working" ? "#f0f0f0" : ACCENT, color: status === "working" ? "#aaa" : "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          {status === "working" ? "Parsing with AI…" : "Parse with AI ✦"}
        </button>
      </div>
    </div>
  );
}

/* ─── App ────────────────────────────────────────────────────── */
export default function App() {
  const [courses, setCourses] = useState<Course[]>(INITIAL_COURSES);
  const [selectedId, setSelectedId] = useState("c1");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [target, setTarget] = useState("A");
  const [uploadOpen, setUploadOpen] = useState(false);

  const course = courses.find((c) => c.id === selectedId)!;
  const remaining = course.components.filter(
    (c) => c.earned === null && isNaN(parseFloat(inputs[c.id] ?? ""))
  );
  const setInput = (id: string, val: string) => setInputs((p) => ({ ...p, [id]: val }));

  const projected = computeProjected(course, inputs);
  const projGrade = projected !== null ? gradeFor(projected) : null;
  const targetMin = GRADES.find((g) => g.label === target)?.min ?? 90;
  const { minPct, maxPct } = safetyRange(course, inputs);
  const targetSecured = minPct >= targetMin;
  const targetImpossible = maxPct < targetMin;
  const diagType = targetSecured ? "secured" : targetImpossible ? "impossible" : "inplay";
  const nextTarget = GRADES[GRADES.findIndex((g) => g.label === target) + 1];

  const primaryComp = remaining.length > 0
    ? remaining.reduce((a, b) => (a.weight > b.weight ? a : b))
    : null;
  const primaryNeeded = primaryComp
    ? requiredOn(course, targetMin, primaryComp.id, inputs, 100)
    : null;

  const gpaItems = courses.map((c, i) => {
    const pg = computeProjected(c, c.id === selectedId ? inputs : {});
    const { maxPct: mx } = safetyRange(c, c.id === selectedId ? inputs : {});
    const g = pg !== null ? gradeFor(pg) : gradeFor(mx);
    return { course: c, grade: g, pct: pg ?? mx, color: BAR_COLORS[i % BAR_COLORS.length] };
  });
  const totalCredits = courses.reduce((s, c) => s + c.credits, 0);
  const semGpa = gpaItems.reduce((s, { course: c, grade: g }) => s + g.gpa * c.credits, 0) / totalCredits;

  const handleParsed = (courseId: string, data: Partial<Course>) => {
    setCourses((prev) => prev.map((c) => c.id !== courseId ? c : {
      ...c, ...data,
      components: (data.components?.length ?? 0) > 0 ? data.components! : c.components,
      parsedFromSyllabus: true,
    }));
    setInputs({});
  };

  const droppedIds = (() => {
    const allRaw: Record<string, number> = {};
    for (const c of course.components) {
      if (c.earned !== null) allRaw[c.id] = c.earned;
      else { const v = parseFloat(inputs[c.id] ?? ""); if (!isNaN(v)) allRaw[c.id] = v; }
    }
    const kept = applyDropLowest(course, allRaw);
    return new Set(Object.keys(allRaw).filter((id) => !(id in kept)));
  })();

  const cutoffGrades = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C"];
  const targetButtons = ["A+", "A", "A-", "B+", "B", "B-"];

  const diagColors = {
    secured:    { bg: "#f0fdf4", border: "#86efac", badge: "#dcfce7", badgeText: "#15803d", dot: "#22c55e" },
    impossible: { bg: "#fef2f2", border: "#fca5a5", badge: "#fee2e2", badgeText: "#dc2626", dot: "#ef4444" },
    inplay:     { bg: "#fdf9f8", border: "#f0e0dc", badge: "#dcfce7", badgeText: "#15803d", dot: ACCENT },
  }[diagType];

  const diagLabel = { secured: "Goal Secured", impossible: "Not Achievable", inplay: "Goal Achievable" }[diagType];
  const diagNote = diagType === "secured"
    ? `Even with 0 on everything, you still reach ${target}. You're safe.`
    : diagType === "impossible"
    ? `Max possible is ${maxPct.toFixed(1)}% (${gradeFor(maxPct).label}). ${nextTarget ? `Try targeting ${nextTarget.label} instead.` : ""}`
    : `Floor ${minPct.toFixed(1)}% · Ceiling ${maxPct.toFixed(1)}% — ${target} is within reach.`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#f7f7f6", fontFamily: "Inter, system-ui, sans-serif", overflow: "hidden" }}>
      {uploadOpen && <UploadModal courseId={selectedId} onClose={() => setUploadOpen(false)} onParsed={handleParsed} />}

      {/* ── Top bar ── */}
      <div style={{ height: 46, background: "#fff", borderBottom: "1px solid #ebebeb", display: "flex", alignItems: "center", padding: "0 20px", gap: 16, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginRight: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontSize: 9, fontWeight: 900 }}>GP</span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#111", letterSpacing: "-0.03em" }}>GradePilot</span>
          <span style={{ fontSize: 10, color: "#ccc", letterSpacing: "0.06em" }}>ENGINE</span>
        </div>
        <div style={{ width: 1, height: 16, background: "#ebebeb" }} />
        {/* Course tabs */}
        <div style={{ display: "flex", gap: 2, flex: 1 }}>
          {courses.map((c) => {
            const pg = computeProjected(c, c.id === selectedId ? inputs : {});
            const gi = pg !== null ? gradeFor(pg) : null;
            const active = c.id === selectedId;
            return (
              <button key={c.id} onClick={() => { setSelectedId(c.id); setInputs({}); }}
                style={{
                  padding: "4px 12px", borderRadius: 16, border: "none",
                  background: active ? "#111" : "transparent",
                  color: active ? "#fff" : "#999",
                  fontSize: 11, fontWeight: active ? 600 : 400, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 5,
                }}>
                <span style={{ fontFamily: "DM Mono, monospace" }}>{c.code}</span>
                {gi && <span style={{ fontFamily: "DM Mono, monospace", fontWeight: 700, color: active ? "#888" : (GRADE_COLORS[gi.label] ?? "#aaa") }}>{gi.label}</span>}
              </button>
            );
          })}
        </div>
        <button onClick={() => setUploadOpen(true)}
          style={{ padding: "5px 12px", border: "1px solid #e4e4e4", borderRadius: 8, background: "#fff", color: "#888", fontSize: 11, cursor: "pointer", fontWeight: 500, flexShrink: 0 }}>
          ✦ Upload Syllabus
        </button>
      </div>

      {/* ── Body: 3 columns ── */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "220px 1fr 300px", overflow: "hidden" }}>

        {/* ── Col 1: Course info + GPA ── */}
        <div style={{ background: "#fff", borderRight: "1px solid #ebebeb", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Course header */}
          <div style={{ padding: "16px 18px", borderBottom: "1px solid #f4f4f4" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Current Course</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111", lineHeight: 1.35, marginBottom: 3 }}>{course.name}</div>
            <div style={{ fontSize: 10, color: "#aaa", fontFamily: "DM Mono, monospace" }}>{course.code} · {course.credits} cr</div>
            <div style={{ fontSize: 10, color: "#bbb", marginTop: 2 }}>{course.professor}</div>

            {projGrade && projected !== null && (
              <div style={{ marginTop: 12, display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontFamily: "DM Mono, monospace", fontSize: 32, fontWeight: 900, color: GRADE_COLORS[projGrade.label] ?? "#888", letterSpacing: "-0.02em" }}>{projGrade.label}</span>
                <span style={{ fontFamily: "DM Mono, monospace", fontSize: 12, color: "#bbb" }}>{projected.toFixed(1)}%</span>
              </div>
            )}

            {course.dropLowest && (
              <div style={{ marginTop: 8, padding: "5px 9px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, fontSize: 10, color: "#1d4ed8" }}>
                Drop Lowest active
              </div>
            )}
            {course.penaltyNote && (
              <div style={{ marginTop: 6, padding: "5px 9px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, fontSize: 10, color: "#92400e" }}>
                ⚠ {course.penaltyNote}
              </div>
            )}
          </div>

          {/* GPA section */}
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #f4f4f4" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.08em" }}>Semester GPA</div>
              <div>
                <span style={{ fontFamily: "DM Mono, monospace", fontSize: 20, fontWeight: 900, color: "#111" }}>{semGpa.toFixed(2)}</span>
                <span style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: "#bbb" }}>/4.5</span>
              </div>
            </div>
            {gpaItems.map(({ course: c, grade: g, pct, color }) => (
              <div key={c.id} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "#444" }}>{c.code}</div>
                    <div style={{ fontSize: 9, color: "#bbb", marginTop: 1 }}>{c.name.slice(0, 20)}{c.name.length > 20 ? "…" : ""}</div>
                  </div>
                  <span style={{ fontFamily: "DM Mono, monospace", fontSize: 12, fontWeight: 800, color: GRADE_COLORS[g.label] ?? "#888" }}>{g.label}</span>
                </div>
                <div style={{ height: 4, background: "#f0f0f0", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.4s" }} />
                </div>
              </div>
            ))}
          </div>

          {/* Component summary */}
          <div style={{ padding: "14px 18px", flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Progress</div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1, padding: "10px 12px", background: "#fafafa", border: "1px solid #f0f0f0", borderRadius: 10, textAlign: "center" }}>
                <div style={{ fontFamily: "DM Mono, monospace", fontSize: 22, fontWeight: 800, color: "#111" }}>
                  {course.components.filter((c) => c.earned !== null).length}
                </div>
                <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>Graded</div>
              </div>
              <div style={{ flex: 1, padding: "10px 12px", background: "#fafafa", border: "1px solid #f0f0f0", borderRadius: 10, textAlign: "center" }}>
                <div style={{ fontFamily: "DM Mono, monospace", fontSize: 22, fontWeight: 800, color: remaining.length > 0 ? ACCENT : "#15803d" }}>
                  {remaining.length}
                </div>
                <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>Remaining</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Col 2: Assessment table + cutoff table ── */}
        <div style={{ overflow: "auto", display: "flex", flexDirection: "column", gap: 0 }}>
          {/* Assessment table */}
          <div style={{ background: "#fff", borderBottom: "1px solid #ebebeb", flexShrink: 0 }}>
            <div style={{ padding: "14px 22px 12px", borderBottom: "1px solid #f4f4f4", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>Grade Components</div>
              <div style={{ fontSize: 10, color: "#bbb" }}>
                {course.components.filter((c) => c.earned !== null).length}/{course.components.length} graded
              </div>
            </div>

            {/* Table header */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 72px 130px 54px", padding: "8px 22px", background: "#fafafa", borderBottom: "1px solid #f4f4f4" }}>
              {["Assessment", "Weight", "Score", "Grade"].map((h) => (
                <div key={h} style={{ fontSize: 10, color: "#bbb", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</div>
              ))}
            </div>

            {course.components.map((comp, i) => {
              const isPending = comp.earned === null;
              const inputVal = inputs[comp.id] ?? "";
              const num = isPending ? parseFloat(inputVal) : comp.earned!;
              const pct = isNaN(num) ? null : (num / comp.total) * 100;
              const gi = pct !== null ? gradeFor(pct) : null;
              const isDropped = droppedIds.has(comp.id);
              return (
                <div key={comp.id} style={{
                  display: "grid", gridTemplateColumns: "1fr 72px 130px 54px",
                  padding: "11px 22px", alignItems: "center",
                  borderBottom: i < course.components.length - 1 ? "1px solid #f8f8f8" : "none",
                  opacity: isDropped ? 0.4 : 1,
                  background: isPending && !isDropped ? "#fdfcfb" : "#fff",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: isPending ? "#ddd" : ACCENT, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: "#111", fontWeight: 500, textDecoration: isDropped ? "line-through" : "none" }}>{comp.name}</span>
                    {isDropped && <span style={{ fontSize: 9, color: "#bbb", background: "#f4f4f4", padding: "1px 5px", borderRadius: 3, fontWeight: 700 }}>DROPPED</span>}
                  </div>
                  <div style={{ fontFamily: "DM Mono, monospace", fontSize: 12, color: "#888", fontWeight: 600 }}>{comp.weight}%</div>
                  <div>
                    {isPending ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <input type="number" min={0} max={comp.total} placeholder="—"
                          value={inputVal} onChange={(e) => setInput(comp.id, e.target.value)}
                          style={{ width: 60, padding: "5px 8px", border: "1.5px solid #e4e4e4", borderRadius: 7, fontSize: 13, fontFamily: "DM Mono, monospace", fontWeight: 700, outline: "none", color: "#111", textAlign: "center", background: "#fafafa" }}
                          onFocus={(e) => { e.target.style.borderColor = ACCENT; e.target.style.background = "#fff"; }}
                          onBlur={(e) => { e.target.style.borderColor = "#e4e4e4"; e.target.style.background = "#fafafa"; }}
                        />
                        <span style={{ fontSize: 10, color: "#ccc", fontFamily: "DM Mono, monospace" }}>/{comp.total}</span>
                      </div>
                    ) : (
                      <span style={{ fontFamily: "DM Mono, monospace", fontSize: 13, fontWeight: 700, color: "#111" }}>
                        {comp.earned} <span style={{ color: "#ccc", fontWeight: 400, fontSize: 11 }}>/{comp.total}</span>
                      </span>
                    )}
                  </div>
                  <div>
                    {gi ? (
                      <span style={{ fontFamily: "DM Mono, monospace", fontSize: 12, fontWeight: 800, color: isPending ? "#bbb" : (GRADE_COLORS[gi.label] ?? "#888") }}>{gi.label}</span>
                    ) : (
                      <span style={{ fontSize: 11, color: "#ddd" }}>—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cutoff table */}
          {remaining.length > 0 && (
            <div style={{ background: "#fff", flex: 1 }}>
              <div style={{ padding: "14px 22px 10px", borderBottom: "1px solid #f4f4f4", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>All-Grade Cutoff Table</div>
                <div style={{ fontSize: 11, color: "#bbb" }}>score needed per remaining item</div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                      <th style={{ textAlign: "left", padding: "8px 14px 8px 22px", fontSize: 10, color: "#bbb", fontWeight: 700, textTransform: "uppercase", whiteSpace: "nowrap" }}>Grade</th>
                      <th style={{ textAlign: "left", padding: "8px 14px", fontSize: 10, color: "#bbb", fontWeight: 700, textTransform: "uppercase" }}>Cutoff</th>
                      {remaining.map((c) => (
                        <th key={c.id} style={{ textAlign: "right", padding: "8px 14px", fontSize: 10, color: "#bbb", fontWeight: 700, textTransform: "uppercase", whiteSpace: "nowrap" }}>
                          {c.name.replace("Examination", "Exam").replace("Reflection Paper", "Reflection")}
                        </th>
                      ))}
                      <th style={{ textAlign: "right", padding: "8px 22px 8px 14px", fontSize: 10, color: "#bbb", fontWeight: 700, textTransform: "uppercase" }}>Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cutoffGrades.map((gl) => {
                      const g = GRADES.find((x) => x.label === gl)!;
                      const neededs = remaining.map((c) => requiredOn(course, g.min, c.id, inputs, 100));
                      const worst = Math.max(...neededs);
                      const allImp = neededs.every((n) => n > 100);
                      const allSec = neededs.every((n) => n <= 0);
                      const isTarget = gl === target;
                      const vc = allImp ? "#dc2626" : allSec ? "#15803d" : worst <= 75 ? "#15803d" : worst <= 88 ? "#2563eb" : "#b45309";
                      const vt = allImp ? "Impossible" : allSec ? "Secured ✓" : worst <= 75 ? "Safe" : worst <= 88 ? "Doable" : "Hard push";
                      return (
                        <tr key={gl} style={{ borderTop: "1px solid #f8f8f8", background: isTarget ? "#fdf8f7" : "transparent" }}>
                          <td style={{ padding: "9px 14px 9px 22px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontFamily: "DM Mono, monospace", fontSize: 13, fontWeight: 800, color: GRADE_COLORS[gl] ?? "#888" }}>{gl}</span>
                              {isTarget && <span style={{ fontSize: 9, fontWeight: 700, color: ACCENT, background: "#fff0ed", padding: "1px 5px", borderRadius: 3 }}>TARGET</span>}
                            </div>
                          </td>
                          <td style={{ padding: "9px 14px", fontFamily: "DM Mono, monospace", fontSize: 11, color: "#bbb" }}>{g.min}%</td>
                          {neededs.map((n, i) => {
                            const imp = n > 100, sec = n <= 0;
                            return (
                              <td key={i} style={{ textAlign: "right", padding: "9px 14px" }}>
                                <span style={{ fontFamily: "DM Mono, monospace", fontSize: 13, fontWeight: 700, color: imp ? "#dc2626" : sec ? "#15803d" : n > 90 ? "#b45309" : "#111" }}>
                                  {imp ? "N/A" : sec ? "Any" : Math.ceil(n)}
                                </span>
                              </td>
                            );
                          })}
                          <td style={{ textAlign: "right", padding: "9px 22px 9px 14px" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: vc }}>{vt}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── Col 3: Target grade + Safety ── */}
        <div style={{ background: "#fff", borderLeft: "1px solid #ebebeb", display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Target grade picker */}
          <div style={{ padding: "16px 18px", borderBottom: "1px solid #f4f4f4", flexShrink: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Target Grade</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 16 }}>
              {targetButtons.map((g) => {
                const active = target === g;
                return (
                  <button key={g} onClick={() => setTarget(g)}
                    style={{
                      padding: "9px 0", borderRadius: 9,
                      border: `2px solid ${active ? ACCENT : "#ebebeb"}`,
                      background: active ? ACCENT : "#fff",
                      color: active ? "#fff" : "#aaa",
                      fontSize: 13, fontWeight: 800, fontFamily: "DM Mono, monospace",
                      cursor: "pointer", transition: "all 0.12s",
                    }}>
                    {g}
                  </button>
                );
              })}
            </div>

            {/* Score hero */}
            <div style={{
              borderRadius: 12, padding: "18px 16px", textAlign: "center",
              background: diagColors.bg, border: `1.5px solid ${diagColors.border}`,
            }}>
              <div style={{ fontSize: 10, color: "#aaa", marginBottom: 6 }}>
                {primaryComp ? `Min. needed — ${primaryComp.name}` : "Minimum required score"}
              </div>

              {diagType === "secured" ? (
                <div style={{ fontFamily: "DM Mono, monospace", fontSize: 52, fontWeight: 900, color: "#15803d", lineHeight: 1 }}>✓</div>
              ) : diagType === "impossible" ? (
                <div style={{ fontFamily: "DM Mono, monospace", fontSize: 52, fontWeight: 900, color: "#dc2626", lineHeight: 1 }}>✕</div>
              ) : primaryNeeded !== null ? (
                <div style={{ lineHeight: 1 }}>
                  <span style={{ fontFamily: "DM Mono, monospace", fontSize: 58, fontWeight: 900, color: "#111", letterSpacing: "-0.02em" }}>{Math.ceil(primaryNeeded)}</span>
                  <span style={{ fontFamily: "DM Mono, monospace", fontSize: 16, color: "#888", marginLeft: 2 }}>pts</span>
                </div>
              ) : (
                <div style={{ fontFamily: "DM Mono, monospace", fontSize: 36, color: "#aaa" }}>—</div>
              )}

              <div style={{
                display: "inline-flex", alignItems: "center", gap: 5, marginTop: 10,
                padding: "4px 12px", borderRadius: 20,
                background: diagColors.badge, color: diagColors.badgeText,
                fontSize: 11, fontWeight: 700,
              }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: diagColors.badgeText }} />
                {diagLabel}
              </div>
            </div>
          </div>

          {/* Safety diagnosis */}
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #f4f4f4", flexShrink: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Safety Diagnosis</div>
            <div style={{ fontSize: 12, color: "#555", lineHeight: 1.65 }}>{diagNote}</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
              <div style={{ padding: "10px 12px", background: "#fafafa", border: "1px solid #f0f0f0", borderRadius: 9, textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "#bbb", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Floor</div>
                <div style={{ fontFamily: "DM Mono, monospace", fontSize: 18, fontWeight: 800, color: GRADE_COLORS[gradeFor(minPct).label] ?? "#888" }}>{gradeFor(minPct).label}</div>
                <div style={{ fontSize: 9, color: "#ccc", marginTop: 2, fontFamily: "DM Mono, monospace" }}>{minPct.toFixed(1)}%</div>
              </div>
              <div style={{ padding: "10px 12px", background: "#fafafa", border: "1px solid #f0f0f0", borderRadius: 9, textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "#bbb", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Ceiling</div>
                <div style={{ fontFamily: "DM Mono, monospace", fontSize: 18, fontWeight: 800, color: GRADE_COLORS[gradeFor(maxPct).label] ?? "#888" }}>{gradeFor(maxPct).label}</div>
                <div style={{ fontSize: 9, color: "#ccc", marginTop: 2, fontFamily: "DM Mono, monospace" }}>{maxPct.toFixed(1)}%</div>
              </div>
            </div>
          </div>

          {/* All remaining items needed scores */}
          {remaining.length > 1 && (
            <div style={{ padding: "14px 18px", flex: 1, overflow: "auto" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>All Remaining</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {remaining.map((comp) => {
                  const needed = requiredOn(course, targetMin, comp.id, inputs, 100);
                  const imp = needed > 100, sec = needed <= 0;
                  const color = imp ? "#dc2626" : sec ? "#15803d" : needed > 90 ? "#b45309" : "#111";
                  return (
                    <div key={comp.id} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "9px 12px", borderRadius: 9,
                      background: imp ? "#fef2f2" : sec ? "#f0fdf4" : "#fafafa",
                      border: `1px solid ${imp ? "#fecaca" : sec ? "#bbf7d0" : "#f0f0f0"}`,
                    }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 500, color: "#555" }}>{comp.name}</div>
                        <div style={{ fontSize: 9, color: "#bbb", fontFamily: "DM Mono, monospace", marginTop: 1 }}>{comp.weight}% weight</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "DM Mono, monospace", fontSize: 20, fontWeight: 800, color, lineHeight: 1 }}>
                          {imp ? "N/A" : sec ? "Any" : Math.ceil(needed)}
                        </div>
                        <div style={{ fontSize: 9, color: "#bbb", marginTop: 1 }}>pts needed</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
