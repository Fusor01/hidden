export type Role = "student" | "faculty" | "admin";
export interface Me { id: string; role: Role; name: string }
export interface StudentCampaign {
  id: string; name: string; course_code: string; course_title: string; faculty: string;
  ends_at: string; status: "open" | "closed"; state: "not_started" | "started";
}
export interface Question {
  id: string; type: "star" | "numeric" | "single" | "multi" | "text"; prompt: string; required: boolean;
  min_value: number | null; max_value: number | null; options: { id: string; label: string }[];
}
export interface CampaignDetail {
  id: string; name: string; description: string | null; ends_at: string; text_enabled: boolean;
  key_id: string; public_key: string; state: string; questions: Question[];
}
export interface QuestionResult {
  question_id: string; prompt: string; type: Question["type"]; suppressed: boolean; n: number;
  mean?: number; distribution?: Record<string, number>; options?: { label: string; count: number }[]; texts?: string[];
}
export type Results =
  | { released: false; reason: "campaign_not_closed" | "below_threshold"; k?: number }
  | { released: true; n: number; k: number; overall_mean: number | null; questions: QuestionResult[] };
export interface AdminCampaign {
  id: string; name: string; status: "draft" | "open" | "closed"; starts_at: string; ends_at: string;
  k_threshold: number; roster_hash: string | null; questions: { type: string; prompt: string }[];
}
