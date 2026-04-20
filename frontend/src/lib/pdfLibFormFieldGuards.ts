/**
 * Duck-typed guards for pdf-lib AcroForm widgets. The project uses `moduleResolution: "bundler"`,
 * which can fail to surface `PDFTextField` / `PDFCheckBox` as named exports from `pdf-lib` while
 * still typing `getField` / `getFields` as the base `PDFField`.
 */

export type PdfTextFieldLike = {
  getName(): string;
  setText(value: string): void;
  getText(): string | undefined;
};

export type PdfCheckBoxLike = {
  getName(): string;
  check(): void;
  uncheck(): void;
  isChecked(): boolean;
};

export function isPdfTextField(field: unknown): field is PdfTextFieldLike {
  if (typeof field !== "object" || field === null) return false;
  const o = field as Record<string, unknown>;
  return (
    typeof o.getName === "function" &&
    typeof o.setText === "function" &&
    typeof o.getText === "function"
  );
}

export function isPdfCheckBox(field: unknown): field is PdfCheckBoxLike {
  if (typeof field !== "object" || field === null) return false;
  const o = field as Record<string, unknown>;
  return (
    typeof o.getName === "function" &&
    typeof o.check === "function" &&
    typeof o.uncheck === "function" &&
    typeof o.isChecked === "function"
  );
}
