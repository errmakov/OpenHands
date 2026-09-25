import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { IntegrationCatalogEntry as MarketplaceEntry } from "@openhands/extensions/integrations";
import { mergeImportedMcpCatalogEntries } from "#/utils/mcp-catalog-import";

/**
 * MCP catalog entries imported from JSON on the MCP page. Deliberately
 * in-memory only: imports are a way to try an entry before it ships in
 * `@openhands/extensions`, so they disappear on reload.
 */
interface ImportedMcpCatalogState {
  entries: MarketplaceEntry[];
}

interface ImportedMcpCatalogActions {
  /** Adds entries, replacing any earlier import with the same id. */
  importEntries: (entries: MarketplaceEntry[]) => void;
}

type ImportedMcpCatalogStore = ImportedMcpCatalogState &
  ImportedMcpCatalogActions;

const initialState: ImportedMcpCatalogState = { entries: [] };

export const useImportedMcpCatalogStore = create<ImportedMcpCatalogStore>()(
  devtools(
    (set) => ({
      ...initialState,
      importEntries: (entries) =>
        set((state) => ({
          entries: mergeImportedMcpCatalogEntries(state.entries, entries),
        })),
    }),
    { name: "ImportedMcpCatalogStore" },
  ),
);
