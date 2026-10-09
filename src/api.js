export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.csrf ? { "x-csrf-token": options.csrf } : {}),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.message || "Request failed.");
    error.fields = data.fields || {};
    error.status = response.status;
    throw error;
  }
  return data;
}
