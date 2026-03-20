import type { PluginMarketplaceEntry } from "./types.js";

const MOOCODE_PLUGIN_TOPIC = "moocode-plugin";
const GITHUB_API = "https://api.github.com";

interface GitHubSearchItem {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  owner: { login: string };
  topics?: string[];
}

interface GitHubSearchResponse {
  items: GitHubSearchItem[];
  total_count: number;
}

interface GitHubContentsResponse {
  content: string;
  encoding: string;
}

async function githubFetch<T>(endpoint: string): Promise<T> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "moocode-cli",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = `${GITHUB_API}${endpoint}`;
  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText}`,
    );
  }

  return response.json() as Promise<T>;
}

export async function searchPlugins(
  query?: string,
): Promise<PluginMarketplaceEntry[]> {
  const q = query
    ? `${query} topic:${MOOCODE_PLUGIN_TOPIC}`
    : `topic:${MOOCODE_PLUGIN_TOPIC}`;

  const data = await githubFetch<GitHubSearchResponse>(
    `/search/repositories?q=${encodeURIComponent(q)}&sort=stars&per_page=30`,
  );

  const entries: PluginMarketplaceEntry[] = [];

  for (const repo of data.items) {
    let version = "0.0.0";

    try {
      const manifest = await fetchPluginManifest(repo.full_name);
      if (manifest) {
        version = manifest.version;
      }
    } catch {
      // Ignore manifest fetch errors
    }

    entries.push({
      name: repo.full_name,
      version,
      description: repo.description ?? "No description",
      author: repo.owner.login,
      repository: repo.html_url,
      stars: repo.stargazers_count,
      keywords: repo.topics,
    });
  }

  return entries;
}

export async function fetchPluginManifest(
  fullName: string,
): Promise<{ name: string; version: string; description: string } | null> {
  try {
    const data = await githubFetch<GitHubContentsResponse>(
      `/repos/${fullName}/contents/plugin.json`,
    );

    const content = Buffer.from(data.content, "base64").toString("utf8");
    const parsed = JSON.parse(content);

    return {
      name: parsed.name ?? fullName.split("/")[1],
      version: parsed.version ?? "0.0.0",
      description: parsed.description ?? "",
    };
  } catch {
    return null;
  }
}

export async function getPluginDetails(
  fullName: string,
): Promise<PluginMarketplaceEntry | null> {
  try {
    const repo = await githubFetch<GitHubSearchItem>(`/repos/${fullName}`);
    const manifest = await fetchPluginManifest(fullName);

    return {
      name: fullName,
      version: manifest?.version ?? "0.0.0",
      description:
        manifest?.description ?? repo.description ?? "No description",
      author: repo.owner.login,
      repository: repo.html_url,
      stars: repo.stargazers_count,
      keywords: repo.topics,
    };
  } catch {
    return null;
  }
}
