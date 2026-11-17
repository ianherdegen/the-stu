export async function readStored(stored) {
  if (!stored || !/^https?:\/\//i.test(stored)) return null;
  const response = await fetch(stored);
  if (!response.ok) return null;
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    type: response.headers.get("content-type") || "application/octet-stream",
  };
}
