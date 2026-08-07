/**
 * Condition grades.
 *
 * A grade is a pricing input, not a label — it decides what a machine is worth
 * and what the copy on its page is allowed to claim — so the vocabulary is a
 * Postgres enum and a new grade is a deliberate code change, not a row someone
 * adds on a Tuesday.
 *
 * The blurbs are the same promise made on /conditions. They render inline in the
 * intake form so two workers grading two fryers on two different days apply the
 * same standard.
 */

export const CONDITION_GRADES = ["A", "B", "C"] as const;
export type ConditionGrade = (typeof CONDITION_GRADES)[number];

export const GRADE_GUIDANCE: Record<ConditionGrade, string> = {
  A: "Presents as near-new. No dents, no significant wear, nothing a buyer would ask about in a photo.",
  B: "Mechanically sound, cosmetically honest — scuffs, dents or heat colouring that are visible and priced in.",
  C: "Works, and looks its age. Structural marks we have chosen not to repair, reflected in the price.",
};
