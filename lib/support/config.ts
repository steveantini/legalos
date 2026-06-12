/**
 * The support assistant's release switch (D-160).
 *
 * While false, the assistant renders on /support ONLY for a signed-in
 * platform owner, and the API route refuses everyone else — the operator
 * beats on it against the delight bar first. THE PUBLIC FLIP IS THIS ONE
 * LINE: set it to true and the assistant appears for every visitor, with
 * the rate limits, length caps, and the daily resting cap already in force.
 */
export const SUPPORT_ASSISTANT_PUBLIC = false;
