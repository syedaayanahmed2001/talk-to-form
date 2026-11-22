import type { IncidentRecord } from "@/lib/incident/schema";
import type { JsonCompletionRequest, Provider, Transcription } from "@/lib/provider/types";

export const TRANSCRIPT =
  "Yesterday around half past two, in the packing hall of Halle 3, Mara Lindqvist slipped on " +
  "spilled oil and cut her left hand. Jonas Petrov gave her first aid with the kit by the door. " +
  "Ilse Brandt saw it happen. We closed the aisle and cleaned the floor. Somebody should fix the " +
  "leaking forklift by Friday.";

export function validRecord(): IncidentRecord {
  return {
    summary: {
      value: "Mara Lindqvist slipped on spilled oil in the packing hall and cut her left hand.",
      source: "Mara Lindqvist slipped on spilled oil and cut her left hand",
      confidence: "high",
    },
    date: { value: "2026-11-21", source: "Yesterday", confidence: "high" },
    time: { value: "14:30", source: "around half past two", confidence: "medium" },
    location: {
      value: "Packing hall, Halle 3",
      source: "in the packing hall of Halle 3",
      confidence: "high",
    },
    peopleInvolved: {
      value: [
        { name: "Mara Lindqvist", role: "Injured person" },
        { name: "Jonas Petrov", role: "First aider" },
      ],
      source: "Mara Lindqvist slipped",
      confidence: "high",
    },
    injuries: {
      value: [
        { person: "Mara Lindqvist", description: "Cut", bodyPart: "Left hand", treatment: "first_aid" },
      ],
      source: "cut her left hand",
      confidence: "high",
    },
    immediateActions: {
      value: ["First aid with the kit by the door", "Aisle closed", "Floor cleaned"],
      source: "We closed the aisle and cleaned the floor",
      confidence: "high",
    },
    witnesses: {
      value: [{ name: "Ilse Brandt", contact: null }],
      source: "Ilse Brandt saw it happen",
      confidence: "high",
    },
    followUps: {
      value: [{ action: "Repair the leaking forklift", owner: null, dueDate: "2026-11-27" }],
      source: "Somebody should fix the leaking forklift by Friday",
      confidence: "medium",
    },
  };
}

/** A provider that answers from a script and records every call. Never touches the network. */
export function scriptedProvider(answers: (string | Error)[]): Provider & {
  calls: JsonCompletionRequest[];
} {
  const calls: JsonCompletionRequest[] = [];
  return {
    name: "scripted",
    calls,
    async transcribe(): Promise<Transcription> {
      throw new Error("not used");
    },
    async completeJson(request) {
      calls.push(request);
      const answer = answers[calls.length - 1];
      if (answer === undefined) throw new Error(`Unexpected call #${calls.length}`);
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}
