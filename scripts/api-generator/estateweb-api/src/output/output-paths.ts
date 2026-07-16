import fs from "node:fs";
import path from "node:path";

export interface OutputPaths {
  sessionPath: string;
  summaryPath: string;
}

/** Resolves the "{{index}}" placeholder to the next unused session number, and derives a matching summary path. */
export function resolveOutputPaths(outputFileTemplate: string): OutputPaths {
  const dir = path.dirname(outputFileTemplate);
  fs.mkdirSync(dir, { recursive: true });

  const sessionPath = outputFileTemplate.includes("{{index}}")
    ? nextAvailablePath(outputFileTemplate)
    : outputFileTemplate;

  return { sessionPath, summaryPath: deriveSummaryPath(sessionPath) };
}

function nextAvailablePath(template: string): string {
  let index = 1;
  let candidate = template.replace("{{index}}", String(index));

  while (fs.existsSync(candidate)) {
    index += 1;
    candidate = template.replace("{{index}}", String(index));
  }

  return candidate;
}

function deriveSummaryPath(sessionPath: string): string {
  const dir = path.dirname(sessionPath);
  const base = path.basename(sessionPath);

  if (base.includes("session")) {
    return path.join(dir, base.replace("session", "summary"));
  }

  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length);
  return path.join(dir, `${stem}.summary${ext}`);
}
