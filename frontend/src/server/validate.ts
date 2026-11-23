import { ApiError } from "./http";

const bad = (msg: string): never => {
  throw new ApiError(400, msg);
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function str(v: unknown, label: string, min = 1, max = 5000): string {
  if (typeof v !== "string" || v.length < min || v.length > max) bad(`Invalid ${label}`);
  return v as string;
}

export function optStr(v: unknown, label: string, max = 5000): string | null {
  if (v === undefined || v === null || v === "") return null;
  return str(v, label, 1, max);
}

export function uuid(v: unknown, label: string): string {
  if (typeof v !== "string" || !UUID.test(v)) bad(`Invalid ${label}`);
  return v as string;
}

export function optUuid(v: unknown, label: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  return uuid(v, label);
}

export function uuidList(v: unknown, label: string, max = 5000): string[] {
  if (!Array.isArray(v) || v.length > max) bad(`Invalid ${label}`);
  return (v as unknown[]).map((x) => uuid(x, label));
}

export function int(v: unknown, label: string, min?: number, max?: number): number {
  if (typeof v !== "number" || !Number.isInteger(v)) bad(`Invalid ${label}`);
  if (min !== undefined && (v as number) < min) bad(`Invalid ${label}`);
  if (max !== undefined && (v as number) > max) bad(`Invalid ${label}`);
  return v as number;
}

export function optInt(v: unknown, label: string): number | null {
  if (v === undefined || v === null || v === "") return null;
  return int(v, label);
}

export function bool(v: unknown, label: string, fallback?: boolean): boolean {
  if (v === undefined && fallback !== undefined) return fallback;
  if (typeof v !== "boolean") bad(`Invalid ${label}`);
  return v as boolean;
}

export function oneOf<T extends string>(v: unknown, label: string, values: readonly T[]): T {
  if (typeof v !== "string" || !values.includes(v as T)) bad(`Invalid ${label}`);
  return v as T;
}

export function iso(v: unknown, label: string): string {
  if (typeof v !== "string") bad(`Invalid ${label}`);
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) bad(`Invalid ${label}`);
  return d.toISOString();
}

export function dateOnly(v: unknown, label: string): string {
  const value = str(v, label, 4, 20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(value).getTime())) bad(`Invalid ${label}`);
  return value;
}

export type QuestionInput = {
  type: "star" | "numeric" | "single" | "multi" | "text";
  prompt: string;
  required: boolean;
  min_value: number | null;
  max_value: number | null;
  options: string[];
};

export function questions(v: unknown): QuestionInput[] {
  if (!Array.isArray(v) || v.length < 1 || v.length > 40) bad("Invalid questions");
  return (v as unknown[]).map((raw) => {
    if (!raw || typeof raw !== "object") bad("Invalid question");
    const q = raw as Record<string, unknown>;
    const type = oneOf(q.type, "question type", ["star", "numeric", "single", "multi", "text"] as const);
    const prompt = str(q.prompt, "prompt", 3, 500);
    const required = bool(q.required, "required", true);
    const options = Array.isArray(q.options)
      ? (q.options as unknown[]).map((o) => str(o, "option", 1, 200))
      : [];
    if (type === "single" || type === "multi") {
      if (options.length < 2 || options.length > 20 || options.some((o) => !o.trim())) {
        bad("Choice questions need at least two non-empty options");
      }
    } else if (options.length) {
      bad("Only choice questions take options");
    }
    let min_value = optInt(q.min_value, "min_value");
    let max_value = optInt(q.max_value, "max_value");
    if (type === "star") {
      min_value = 1;
      max_value = 5;
    }
    if (type === "numeric" && (min_value === null || max_value === null || min_value >= max_value)) {
      bad("Numeric questions need min_value < max_value");
    }
    return { type, prompt, required, min_value, max_value, options };
  });
}

export type AnswerInput = {
  question_id: string;
  value: number | null;
  option_ids: string[] | null;
  text: string | null;
};

export function answers(v: unknown): AnswerInput[] {
  if (!Array.isArray(v) || v.length > 100) bad("Invalid answers");
  return (v as unknown[]).map((raw) => {
    if (!raw || typeof raw !== "object") bad("Invalid answer");
    const a = raw as Record<string, unknown>;
    const option_ids = a.option_ids === undefined || a.option_ids === null
      ? null
      : uuidList(a.option_ids, "option_ids", 50);
    return {
      question_id: uuid(a.question_id, "question_id"),
      value: optInt(a.value, "value"),
      option_ids,
      text: optStr(a.text, "text", 2000),
    };
  });
}
