export async function requestApi<T extends `/${string}`>(
	url: T,
	apikey: string,
	params: object = {},
	method: "GET" | "DELETE" | "POST" = "GET") {
	const headers = new Headers({
		"X-Api-Key": apikey,
		"Content-Type": "application/json",
	});
	const uri = new URL(url, "https://api.everhour.com");
	if (method == "GET") {
		for (const [key, value] of Object.entries(params)) {
			uri.searchParams.append(key, value);
		}
	}
	const response = await fetch(uri.toString(), {
		headers,
		method,
		body: method !== "GET" ? JSON.stringify(params) : undefined,
	});
	return await response.json();
}

