// Parse hyperparameters from Jesse strategy Python source code
// Extracts class-level attribute assignments (e.g. htf_ema_period = 200)

export interface Hyperparameter {
  name: string;
  value: string | number | boolean;
  type: "int" | "float" | "string" | "bool";
  line: number;
}

export function parseHyperparameters(source: string): Hyperparameter[] {
  const params: Hyperparameter[] = [];
  const lines = source.split("\n");

  // Match class-level attribute assignments inside the strategy class
  // Pattern: name = value (at class level, not inside methods)
  const attrPattern = /^(\s+)(\w+)\s*=\s*(.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Skip comments, docstrings, imports, decorators
    if (trimmed.startsWith("#") || trimmed.startsWith('"""') || trimmed.startsWith("import") || trimmed.startsWith("from") || trimmed.startsWith("@")) continue;
    // Skip method definitions and their bodies (indented 8+ spaces typically)
    if (trimmed.startsWith("def ") || trimmed.startsWith("class ")) continue;
    // Skip lines inside methods (8+ spaces of indentation typically means method body)
    // Class-level attributes are usually 4 spaces indented

    const match = attrPattern.exec(line);
    if (!match) continue;

    const [, indent, name, valueStr] = match;
    if (!indent || !name || !valueStr) continue;
    // Only capture class-level attributes (4 spaces indent, not inside methods)
    if (indent !== "    ") continue;

    // Skip dunder and private attributes
    if (name.startsWith("_")) continue;
    // Skip common non-hyperparameter attributes
    const skip = ["route", "name", "title", "description"];
    if (skip.includes(name)) continue;

    const trimmedValue = valueStr.trim().replace(/,$/, "");
    let value: string | number | boolean;
    let type: "int" | "float" | "string" | "bool";

    // Parse value type
    if (trimmedValue === "True" || trimmedValue === "False") {
      value = trimmedValue === "True";
      type = "bool";
    } else if (trimmedValue.startsWith('"') || trimmedValue.startsWith("'")) {
      value = trimmedValue.replace(/^["']|["']$/g, "");
      type = "string";
    } else if (/^-?\d+$/.test(trimmedValue)) {
      value = parseInt(trimmedValue, 10);
      type = "int";
    } else if (/^-?\d+\.\d+$/.test(trimmedValue)) {
      value = parseFloat(trimmedValue);
      type = "float";
    } else {
      // Complex expression, store as string
      value = trimmedValue;
      type = "string";
    }

    params.push({ name, value, type, line: i + 1 });
  }

  return params;
}

// Fetch and parse hyperparameters for a strategy
export async function fetchStrategyHyperparameters(
  strategyName: string,
): Promise<Hyperparameter[]> {
  const JESSE_AUTH_TOKEN =
    "8e8718c0ec8e160026556b800be8f54964f5cacc73a80d4545383a2137f7249e";

  const res = await fetch("/api/jesse/strategy/get", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: JESSE_AUTH_TOKEN,
    },
    body: JSON.stringify({ name: strategyName }),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch strategy: ${res.statusText}`);
  }

  const data = await res.json();
  if (data.status !== "success") {
    throw new Error(data.message ?? "Failed to fetch strategy");
  }

  return parseHyperparameters(data.content);
}