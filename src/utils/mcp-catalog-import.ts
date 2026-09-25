import type { IntegrationCatalogEntry as MarketplaceEntry } from "@openhands/extensions/integrations";
import { isMcpInstallableEntry } from "#/utils/mcp-marketplace-utils";

/**
 * Parsing and validation for ad-hoc `IntegrationCatalogEntry` JSON imported on
 * the MCP page (the same shape as `integrations/catalog/*.json` in
 * `OpenHands/extensions`). It is a testing aid for entries that have not been
 * published yet, so it checks the fields the install flow depends on rather
 * than mirroring the strict upstream schema: unknown keys are allowed, which
 * lets an entry use a field newer than the bundled package understands.
 */

export type McpCatalogImportErrorCode =
  | "invalid_json"
  | "no_entries"
  | "not_an_object"
  | "invalid_field"
  | "no_mcp_option";

export interface McpCatalogImportError {
  /** File name, or a caller-chosen label for pasted text. */
  source: string;
  code: McpCatalogImportErrorCode;
  /** Zero-based position of the entry within the source. */
  index?: number;
  /** Dotted path of the offending field, e.g. `connectionOptions[0].auth`. */
  path?: string;
}

export interface McpCatalogImportResult {
  entries: MarketplaceEntry[];
  errors: McpCatalogImportError[];
}

const PROVIDERS = ["mcp", "http"];
const AUTH_STRATEGIES = ["none", "api_key", "bearer", "basic", "oauth2"];
const FIELD_TYPES = ["text", "password"];
const HTTPS_PREFIX = "https://";

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isHttpsUrl = (value: unknown): boolean =>
  isNonEmptyString(value) && value.startsWith(HTTPS_PREFIX);

const isStringArray = (value: unknown): boolean =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

/** Collects the paths of invalid fields for one entry. */
class FieldChecker {
  readonly invalidPaths: string[] = [];

  check(path: string, isValid: boolean): void {
    if (!isValid) this.invalidPaths.push(path);
  }

  optional(
    obj: Json,
    key: string,
    path: string,
    isValid: (value: unknown) => boolean,
  ): void {
    if (obj[key] !== undefined) this.check(`${path}${key}`, isValid(obj[key]));
  }
}

function checkFields(
  checker: FieldChecker,
  value: unknown,
  path: string,
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    checker.check(path, false);
    return;
  }
  value.forEach((field, i) => {
    const fieldPath = `${path}[${i}]`;
    if (!isObject(field)) {
      checker.check(fieldPath, false);
      return;
    }
    checker.check(`${fieldPath}.key`, isNonEmptyString(field.key));
    checker.check(`${fieldPath}.label`, isNonEmptyString(field.label));
    checker.check(
      `${fieldPath}.type`,
      FIELD_TYPES.includes(field.type as string),
    );
    checker.check(`${fieldPath}.required`, typeof field.required === "boolean");
    checker.optional(field, "helperLink", `${fieldPath}.`, isHttpsUrl);
  });
}

function checkTransport(
  checker: FieldChecker,
  transport: unknown,
  path: string,
): void {
  if (!isObject(transport)) {
    checker.check(path, false);
    return;
  }
  if (transport.kind === "shttp" || transport.kind === "sse") {
    checker.check(`${path}.url`, isNonEmptyString(transport.url));
    checkFields(checker, transport.headerFields, `${path}.headerFields`);
    return;
  }
  if (transport.kind === "stdio") {
    checker.check(`${path}.serverName`, isNonEmptyString(transport.serverName));
    checker.check(`${path}.command`, isNonEmptyString(transport.command));
    checker.check(`${path}.args`, isStringArray(transport.args));
    checkFields(checker, transport.envFields, `${path}.envFields`);
    checkFields(checker, transport.argFields, `${path}.argFields`);
    return;
  }
  checker.check(`${path}.kind`, false);
}

function checkConnectionOption(
  checker: FieldChecker,
  option: unknown,
  path: string,
): void {
  if (!isObject(option)) {
    checker.check(path, false);
    return;
  }
  checker.check(`${path}.id`, isNonEmptyString(option.id));
  checker.check(
    `${path}.provider`,
    PROVIDERS.includes(option.provider as string),
  );
  if (option.transport !== undefined) {
    checkTransport(checker, option.transport, `${path}.transport`);
  }
  if (!isObject(option.auth)) {
    checker.check(`${path}.auth`, false);
    return;
  }
  checker.check(
    `${path}.auth.strategy`,
    AUTH_STRATEGIES.includes(option.auth.strategy as string),
  );
  checker.optional(option.auth, "oauth", `${path}.auth.`, isObject);
}

function findInvalidPaths(entry: Json): string[] {
  const checker = new FieldChecker();
  checker.check("id", isNonEmptyString(entry.id));
  checker.check("name", isNonEmptyString(entry.name));
  checker.check("description", isNonEmptyString(entry.description));
  checker.check("docsUrl", isHttpsUrl(entry.docsUrl));
  checker.optional(entry, "appUrl", "", isHttpsUrl);
  checker.optional(entry, "logoUrl", "", isHttpsUrl);
  checker.optional(entry, "keywords", "", isStringArray);
  checker.optional(entry, "categories", "", isStringArray);
  checker.optional(
    entry,
    "popularityRank",
    "",
    (value) => Number.isInteger(value) && (value as number) >= 0,
  );

  const options = entry.connectionOptions;
  if (!Array.isArray(options) || options.length === 0) {
    checker.check("connectionOptions", false);
  } else {
    options.forEach((option, i) =>
      checkConnectionOption(checker, option, `connectionOptions[${i}]`),
    );
  }
  return checker.invalidPaths;
}

function validateEntry(
  entry: unknown,
  source: string,
  index: number,
): McpCatalogImportError[] {
  if (!isObject(entry)) {
    return [{ source, code: "not_an_object", index }];
  }
  const invalidPaths = findInvalidPaths(entry);
  if (invalidPaths.length > 0) {
    return invalidPaths.map((path) => ({
      source,
      code: "invalid_field",
      index,
      path,
    }));
  }
  if (!isMcpInstallableEntry(entry as unknown as MarketplaceEntry)) {
    return [{ source, code: "no_mcp_option", index }];
  }
  return [];
}

/**
 * Parse one catalog file (a single entry object or an array of entries).
 * Valid entries are returned even when siblings in the same source fail, so
 * callers decide whether a partial import is acceptable.
 */
export function parseMcpCatalogImport(
  text: string,
  source: string,
): McpCatalogImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { entries: [], errors: [{ source, code: "invalid_json" }] };
  }

  const candidates = Array.isArray(parsed) ? parsed : [parsed];
  if (candidates.length === 0) {
    return { entries: [], errors: [{ source, code: "no_entries" }] };
  }

  return candidates.reduce<McpCatalogImportResult>(
    (result, candidate, index) => {
      const errors = validateEntry(candidate, source, index);
      return errors.length > 0
        ? { ...result, errors: [...result.errors, ...errors] }
        : {
            ...result,
            entries: [...result.entries, candidate as MarketplaceEntry],
          };
    },
    { entries: [], errors: [] },
  );
}

/**
 * Put imported entries ahead of the bundled catalog. An imported entry
 * replaces a bundled one with the same id, so an edited copy of an existing
 * catalog file can be tested in place.
 */
export function mergeImportedMcpCatalogEntries(
  bundled: MarketplaceEntry[],
  imported: MarketplaceEntry[],
): MarketplaceEntry[] {
  // A repeated id keeps its last occurrence, so the grid never holds two
  // tiles with the same key.
  const lastIndexById = new Map(imported.map((entry, i) => [entry.id, i]));
  const uniqueImported = imported.filter(
    (entry, i) => lastIndexById.get(entry.id) === i,
  );
  const importedIds = new Set(uniqueImported.map((entry) => entry.id));
  return [
    ...uniqueImported,
    ...bundled.filter((entry) => !importedIds.has(entry.id)),
  ];
}
