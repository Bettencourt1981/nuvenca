/**
 * The generated RPC types mark every argument as non-null, but our functions
 * accept SQL NULL for optional ids (e.g. "root of the workspace").
 */
export function nullableArg(value: string | null | undefined): string {
  return (value ?? null) as unknown as string;
}
