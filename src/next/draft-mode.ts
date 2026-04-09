export interface ResolveDraftModeInput {
  readonly preview?: boolean;
  readonly useNextDraftMode?: boolean;
}

async function readNextDraftModeState(): Promise<boolean> {
  const module = await import("next/headers");
  const draftModeState = await module.draftMode();
  return Boolean(draftModeState.isEnabled);
}

export async function resolveDraftMode(input: ResolveDraftModeInput = {}): Promise<boolean> {
  if (typeof input.preview === "boolean") {
    return input.preview;
  }

  if (input.useNextDraftMode !== true) {
    return false;
  }

  try {
    return await readNextDraftModeState();
  } catch {
    return false;
  }
}

