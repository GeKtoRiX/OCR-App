export function parseJsonResponse<T>(response: string): T {
  // Try direct parse
  try {
    return JSON.parse(response) as T;
  } catch {
    // ignore
  }

  // Try extracting from markdown code fences
  const fenceMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]) as T;
    } catch {
      // ignore
    }
  }

  // Try extracting first JSON array or object
  const jsonMatch = response.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]) as T;
    } catch {
      // ignore
    }
  }

  throw new Error(`Failed to parse LLM response as JSON: ${response.slice(0, 200)}`);
}
