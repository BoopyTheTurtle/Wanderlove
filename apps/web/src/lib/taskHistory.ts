import type { Database } from "./database.types";
import { supabase } from "./supabase";

// TODO: import TaskHistoryEntry from @wannadoo/core once feature/quest-core merges
export type TaskHistoryEntry = { taskId: string; outcome: "done" | "skipped"; at: string };

type TaskHistoryRow = Database["public"]["Tables"]["task_history"]["Row"];

// The server keys history on the two people as an unordered pair, smaller id first. A "Just me" quest (no partner)
// records under the player alone, so the partner never sees it.
export function pairOf(meId: string, partnerId: string | null): { person_low: string; person_high: string } {
  const me = meId.toLowerCase();
  const other = (partnerId ?? meId).toLowerCase();
  return me <= other ? { person_low: me, person_high: other } : { person_low: other, person_high: me };
}

export function entryFromRow(row: Pick<TaskHistoryRow, "task_id" | "outcome" | "at">): TaskHistoryEntry {
  return { taskId: row.task_id, outcome: row.outcome === "skipped" ? "skipped" : "done", at: row.at };
}

// The pair's history, oldest first. It survives an unlink, so a relinked pair finds it again.
export async function loadTaskHistory(meId: string, partnerId: string | null): Promise<TaskHistoryEntry[]> {
  const pair = pairOf(meId, partnerId);
  const { data, error } = await supabase
    .from("task_history")
    .select("task_id, outcome, at")
    .eq("person_low", pair.person_low)
    .eq("person_high", pair.person_high)
    .order("at")
    .order("id");
  if (error) throw error;
  return data.map(entryFromRow);
}

// Records a task for the pair; the server stamps the time. Only works while linked to the partner.
export async function recordTask(
  meId: string,
  partnerId: string | null,
  taskId: string,
  outcome: TaskHistoryEntry["outcome"],
): Promise<void> {
  const { error } = await supabase
    .from("task_history")
    .insert({ ...pairOf(meId, partnerId), task_id: taskId, outcome });
  if (error) throw error;
}

// Mobility: true means the person prefers tasks without movement, so quests leave out tasks tagged `move`.
export async function loadMobility(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from("profiles").select("mobility").eq("id", userId).single();
  if (error) throw error;
  return data.mobility;
}

export async function saveMobility(userId: string, mobility: boolean): Promise<void> {
  const { error } = await supabase.from("profiles").update({ mobility }).eq("id", userId);
  if (error) throw error;
}
