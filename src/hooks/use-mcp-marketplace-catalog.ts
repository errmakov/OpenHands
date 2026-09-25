import React from "react";
import {
  INTEGRATION_CATALOG as MCP_MARKETPLACE,
  type IntegrationCatalogEntry as MarketplaceEntry,
} from "@openhands/extensions/integrations";
import { getMcpMarketplaceCatalog } from "#/utils/mcp-marketplace-utils";
import { mergeImportedMcpCatalogEntries } from "#/utils/mcp-catalog-import";
import { useImportedMcpCatalogStore } from "#/stores/imported-mcp-catalog-store";

const BUNDLED_MCP_MARKETPLACE = getMcpMarketplaceCatalog(MCP_MARKETPLACE);

interface McpMarketplaceCatalog {
  /** Imported entries first, then the bundled entries they don't override. */
  catalog: MarketplaceEntry[];
  importedIds: ReadonlySet<string>;
}

/**
 * The MCP marketplace as the MCP page shows it: the bundled
 * `@openhands/extensions` catalog plus any entries imported this session.
 */
export function useMcpMarketplaceCatalog(): McpMarketplaceCatalog {
  const imported = useImportedMcpCatalogStore((state) => state.entries);
  return React.useMemo(
    () => ({
      catalog: mergeImportedMcpCatalogEntries(
        BUNDLED_MCP_MARKETPLACE,
        imported,
      ),
      importedIds: new Set(imported.map((entry) => entry.id)),
    }),
    [imported],
  );
}
