import React from "react";
import { FileUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { BrandButton } from "#/components/features/settings/brand-button";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { ModalCloseButton } from "#/components/shared/modals/modal-close-button";
import { useImportedMcpCatalogStore } from "#/stores/imported-mcp-catalog-store";
import {
  parseMcpCatalogImport,
  type McpCatalogImportError,
  type McpCatalogImportErrorCode,
  type McpCatalogImportResult,
} from "#/utils/mcp-catalog-import";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { formControlMultilineFieldClassName } from "#/utils/form-control-classes";
import { modalTitleLgClassName } from "#/utils/modal-classes";
import { cn } from "#/utils/utils";

interface ImportCatalogModalProps {
  onClose: () => void;
}

const ERROR_MESSAGE_KEYS: Record<McpCatalogImportErrorCode, I18nKey> = {
  invalid_json: I18nKey.MCP$IMPORT_ERROR_INVALID_JSON,
  no_entries: I18nKey.MCP$IMPORT_ERROR_NO_ENTRIES,
  not_an_object: I18nKey.MCP$IMPORT_ERROR_NOT_AN_OBJECT,
  invalid_field: I18nKey.MCP$IMPORT_ERROR_INVALID_FIELD,
  no_mcp_option: I18nKey.MCP$IMPORT_ERROR_NO_MCP_OPTION,
};

async function parseSources(
  files: File[],
  pasted: string,
  pastedSource: string,
): Promise<McpCatalogImportResult> {
  const texts = await Promise.all(files.map((file) => file.text()));
  const results = files.map((file, i) =>
    parseMcpCatalogImport(texts[i], file.name),
  );
  const withPasted = pasted.trim()
    ? [...results, parseMcpCatalogImport(pasted, pastedSource)]
    : results;
  return {
    entries: withPasted.flatMap((result) => result.entries),
    errors: withPasted.flatMap((result) => result.errors),
  };
}

/**
 * Loads `IntegrationCatalogEntry` JSON (files or pasted text) into the MCP
 * library for this session, so an entry can be installed and tested before it
 * is published in `@openhands/extensions`. Nothing is imported unless every
 * source validates.
 */
export function ImportCatalogModal({ onClose }: ImportCatalogModalProps) {
  const { t } = useTranslation("openhands");
  const importEntries = useImportedMcpCatalogStore(
    (state) => state.importEntries,
  );
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [files, setFiles] = React.useState<File[]>([]);
  const [pasted, setPasted] = React.useState("");
  const [errors, setErrors] = React.useState<McpCatalogImportError[]>([]);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);

  const addFiles = (list: FileList | null | undefined) => {
    if (!list || list.length === 0) return;
    // Copy now: the input's FileList is live and is cleared after selection.
    const added = Array.from(list);
    setFiles((current) => [...current, ...added]);
    setErrors([]);
  };

  const canSubmit =
    (files.length > 0 || pasted.trim().length > 0) && !isImporting;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setIsImporting(true);
    let result: McpCatalogImportResult;
    try {
      result = await parseSources(
        files,
        pasted,
        t(I18nKey.MCP$IMPORT_CATALOG_PASTED_SOURCE),
      );
    } catch {
      // Only reading a file can throw; parsing reports errors in `result`.
      displayErrorToast(t(I18nKey.ERROR$GENERIC));
      return;
    } finally {
      setIsImporting(false);
    }
    if (result.errors.length > 0) {
      setErrors(result.errors);
      return;
    }
    importEntries(result.entries);
    displaySuccessToast(
      t(I18nKey.MCP$IMPORT_CATALOG_SUCCESS, { count: result.entries.length }),
    );
    onClose();
  };

  return (
    <ModalBackdrop onClose={onClose} aria-label={t(I18nKey.MCP$IMPORT_CATALOG)}>
      <form
        onSubmit={handleSubmit}
        data-testid="mcp-import-catalog-modal"
        className="relative flex max-h-[85vh] w-[min(36rem,calc(100vw-2rem))] flex-col rounded-xl border border-border bg-base-secondary"
      >
        <ModalCloseButton onClose={onClose} testId="mcp-import-catalog-close" />
        <header className="flex-shrink-0 px-6 pb-4 pt-6">
          <h2 className={cn("pr-6", modalTitleLgClassName)}>
            {t(I18nKey.MCP$IMPORT_CATALOG)}
          </h2>
          <p className="mt-2 text-sm text-tertiary-light">
            {t(I18nKey.MCP$IMPORT_CATALOG_INTRO)}
          </p>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 custom-scrollbar">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="application/json,.json"
            className="hidden"
            data-testid="mcp-import-catalog-file"
            onChange={() => {
              const input = inputRef.current;
              addFiles(input?.files);
              if (input) input.value = "";
            }}
          />
          <div
            data-testid="mcp-import-catalog-dropzone"
            data-active={isDragging ? "true" : "false"}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              addFiles(event.dataTransfer?.files);
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-6 text-center",
              isDragging
                ? "border-focus bg-interactive-hover"
                : "border-border bg-surface",
            )}
          >
            <FileUp className="size-6 text-muted" aria-hidden />
            <p className="text-sm text-content">
              {t(I18nKey.MCP$IMPORT_CATALOG_DROPZONE)}
            </p>
            <BrandButton
              testId="mcp-import-catalog-choose-files"
              type="button"
              variant="secondary"
              onClick={() => inputRef.current?.click()}
            >
              {t(I18nKey.MCP$IMPORT_CATALOG_CHOOSE_FILES)}
            </BrandButton>
            {files.length > 0 ? (
              <ul
                data-testid="mcp-import-catalog-file-list"
                className="text-xs text-tertiary-light"
              >
                {files.map((file, i) => (
                  <li key={`${file.name}-${i}`}>{file.name}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <label className="flex flex-col gap-2 text-sm">
            <span>{t(I18nKey.MCP$IMPORT_CATALOG_PASTE_LABEL)}</span>
            <textarea
              data-testid="mcp-import-catalog-paste"
              rows={6}
              spellCheck={false}
              value={pasted}
              onChange={(event) => {
                setPasted(event.target.value);
                setErrors([]);
              }}
              className={cn(
                formControlMultilineFieldClassName,
                "resize-y font-mono text-xs",
              )}
            />
          </label>

          {errors.length > 0 ? (
            <div
              role="alert"
              data-testid="mcp-import-catalog-errors"
              className="rounded-lg border border-danger/40 px-3 py-2 text-xs text-danger"
            >
              <p className="font-medium">
                {t(I18nKey.MCP$IMPORT_CATALOG_ERRORS_TITLE)}
              </p>
              <ul className="mt-1 list-disc pl-4">
                {errors.map((error, i) => (
                  <li key={`${error.source}-${error.index}-${error.path}-${i}`}>
                    <span className="font-mono">{error.source}</span>
                    {": "}
                    {t(ERROR_MESSAGE_KEYS[error.code], {
                      entry: (error.index ?? 0) + 1,
                      path: error.path,
                    })}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <footer className="flex flex-shrink-0 justify-end gap-2 px-6 pb-6 pt-4">
          <BrandButton
            type="button"
            variant="secondary"
            onClick={onClose}
            testId="mcp-import-catalog-cancel"
          >
            {t(I18nKey.BUTTON$CANCEL)}
          </BrandButton>
          <BrandButton
            type="submit"
            variant="primary"
            testId="mcp-import-catalog-submit"
            isDisabled={!canSubmit}
          >
            {t(I18nKey.MCP$IMPORT_CATALOG_SUBMIT)}
          </BrandButton>
        </footer>
      </form>
    </ModalBackdrop>
  );
}
