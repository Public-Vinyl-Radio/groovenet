import { useCommandPalette } from "@/providers/CommandPaletteProvider";

/** Exercise the registered page handlers without mocking the registration API. */
export function PaletteScopeControls({ query = "dusty" }: { query?: string }) {
  const { scope } = useCommandPalette();
  return (
    <div>
      <span data-testid="palette-scope">{scope?.id}</span>
      {scope?.onSearch && (
        <button onClick={() => scope.onSearch?.(query)}>Run scoped search</button>
      )}
      {scope?.actions?.map((action) => (
        <button
          key={action.id}
          disabled={action.disabled}
          onClick={action.onSelect}
        >{`Palette: ${action.label}`}</button>
      ))}
    </div>
  );
}
