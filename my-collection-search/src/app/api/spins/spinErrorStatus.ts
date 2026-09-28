// The HTTP status for an error thrown while resolving a spin's selection —
// shared by create (POST /api/spins) and edit (PATCH /api/spins/:id).
export function getSpinErrorStatus(message: string): number {
  if (message === "Album not found") return 404;

  const badRequestMessages = [
    "Album has no tracks to log",
    "At least one side must be selected",
    "Duplicate side keys are not allowed",
    "At least one track must be selected",
    "Track friend_id must match the owning album friend_id",
  ];

  if (badRequestMessages.includes(message)) return 400;
  if (message.startsWith("Invalid side key:")) return 400;
  if (message.startsWith("Track does not belong to album:")) return 400;
  if (message.startsWith("Duplicate track selection:")) return 400;

  return 500;
}
