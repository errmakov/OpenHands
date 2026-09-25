import { describe, expect, it } from "vitest";
import type { IntegrationCatalogEntry as MarketplaceEntry } from "@openhands/extensions/integrations";
import {
  mergeImportedMcpCatalogEntries,
  parseMcpCatalogImport,
} from "#/utils/mcp-catalog-import";

const rovoEntry: MarketplaceEntry = {
  id: "atlassian-rovo-test",
  name: "Atlassian Rovo (test)",
  description: "Hosted Atlassian MCP server.",
  docsUrl: "https://support.atlassian.com/rovo",
  connectionOptions: [
    {
      id: "oauth",
      provider: "mcp",
      transport: {
        kind: "shttp",
        url: "https://mcp.atlassian.com/v1/mcp/authv2",
      },
      auth: { strategy: "oauth2", oauth: { clientAuthentication: "none" } },
    },
  ],
};

const stdioEntry: MarketplaceEntry = {
  id: "internal-tools",
  name: "Internal tools",
  description: "Private stdio server.",
  docsUrl: "https://example.com/docs",
  connectionOptions: [
    {
      id: "api",
      provider: "mcp",
      transport: {
        kind: "stdio",
        serverName: "internal-tools",
        command: "npx",
        args: ["-y", "@example/internal-tools"],
        envFields: [
          {
            key: "INTERNAL_TOKEN",
            label: "Token",
            type: "password",
            helperText: "Create one in the admin console.",
            required: true,
          },
        ],
      },
      auth: { strategy: "none" },
    },
  ],
};

describe("parseMcpCatalogImport", () => {
  it("accepts a single entry object or an array of entries", () => {
    expect(
      parseMcpCatalogImport(JSON.stringify(rovoEntry), "rovo.json"),
    ).toEqual({ entries: [rovoEntry], errors: [] });
    expect(
      parseMcpCatalogImport(JSON.stringify([rovoEntry, stdioEntry]), "all"),
    ).toEqual({ entries: [rovoEntry, stdioEntry], errors: [] });
  });

  it("reports malformed JSON without throwing", () => {
    expect(parseMcpCatalogImport("{ not json", "broken.json")).toEqual({
      entries: [],
      errors: [{ source: "broken.json", code: "invalid_json" }],
    });
  });

  it("reports every invalid field with its path and entry index", () => {
    const invalid = {
      ...stdioEntry,
      name: "",
      connectionOptions: [
        {
          ...stdioEntry.connectionOptions[0],
          transport: { kind: "stdio", serverName: "x", command: "npx" },
        },
      ],
    };

    const result = parseMcpCatalogImport(
      JSON.stringify([rovoEntry, invalid]),
      "mixed.json",
    );

    expect(result.entries).toEqual([rovoEntry]);
    expect(result.errors).toEqual([
      { source: "mixed.json", code: "invalid_field", index: 1, path: "name" },
      {
        source: "mixed.json",
        code: "invalid_field",
        index: 1,
        path: "connectionOptions[0].transport.args",
      },
    ]);
  });

  it("rejects links that are not https so they cannot become script URLs", () => {
    const result = parseMcpCatalogImport(
      JSON.stringify({ ...rovoEntry, docsUrl: "javascript:alert(1)" }),
      "rovo.json",
    );

    expect(result.entries).toEqual([]);
    expect(result.errors).toEqual([
      { source: "rovo.json", code: "invalid_field", index: 0, path: "docsUrl" },
    ]);
  });

  it("rejects entries that have no MCP connection option", () => {
    const httpOnly = {
      ...rovoEntry,
      connectionOptions: [
        {
          id: "api",
          provider: "http",
          http: { apiBaseUrl: "https://api.example.com" },
          auth: { strategy: "api_key" },
        },
      ],
    };

    expect(
      parseMcpCatalogImport(JSON.stringify(httpOnly), "http.json").errors,
    ).toEqual([{ source: "http.json", code: "no_mcp_option", index: 0 }]);
  });
});

describe("mergeImportedMcpCatalogEntries", () => {
  it("lists imported entries first and lets them replace a bundled entry with the same id", () => {
    const bundledRovo = { ...rovoEntry, name: "Bundled Rovo" };

    expect(
      mergeImportedMcpCatalogEntries(
        [stdioEntry, bundledRovo],
        [rovoEntry],
      ).map((entry) => entry.name),
    ).toEqual(["Atlassian Rovo (test)", "Internal tools"]);
  });

  it("keeps only the last imported entry when an id repeats", () => {
    const edited = { ...rovoEntry, name: "Edited Rovo" };

    expect(
      mergeImportedMcpCatalogEntries([], [rovoEntry, stdioEntry, edited]).map(
        (entry) => entry.name,
      ),
    ).toEqual(["Internal tools", "Edited Rovo"]);
  });
});
