// Minimal GitHub Gist client. The gist only ever holds an encrypted blob.

export const GIST_FILE = 'wordtrail.json';
export const GIST_DESCRIPTION = 'Wordtrail sync (end-to-end encrypted)';

const API = 'https://api.github.com';

export class GistError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const headers = (token: string) => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
});

const call = async <T,>(token: string, path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(API + path, { ...init, headers: { ...headers(token), ...(init?.body ? { 'Content-Type': 'application/json' } : {}) } });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).message ?? msg;
    } catch {
      /* ignore */
    }
    throw new GistError(res.status, msg);
  }
  return (await res.json()) as T;
};

interface GistFile {
  filename: string;
  content?: string;
  truncated?: boolean;
  raw_url?: string;
}

interface Gist {
  id: string;
  description: string | null;
  updated_at: string;
  files: Record<string, GistFile>;
}

export const whoAmI = (token: string) => call<{ login: string }>(token, '/user');

export const findSyncGist = async (token: string): Promise<Gist | undefined> => {
  for (let page = 1; page <= 5; page++) {
    const list = await call<Gist[]>(token, `/gists?per_page=100&page=${page}`);
    const hit = list.find((g) => g.files && GIST_FILE in g.files);
    if (hit) return hit;
    if (list.length < 100) break;
  }
  return undefined;
};

export const readGist = async (token: string, id: string): Promise<{ content?: string; updatedAt: string }> => {
  const g = await call<Gist>(token, `/gists/${id}`);
  const f = g.files[GIST_FILE];
  if (!f) return { updatedAt: g.updated_at };
  let content = f.content;
  if (f.truncated && f.raw_url) {
    const res = await fetch(f.raw_url, { cache: 'no-store' });
    content = await res.text();
  }
  return { content, updatedAt: g.updated_at };
};

export const createGist = (token: string, content: string) =>
  call<Gist>(token, '/gists', {
    method: 'POST',
    body: JSON.stringify({ description: GIST_DESCRIPTION, public: false, files: { [GIST_FILE]: { content } } }),
  });

export const writeGist = (token: string, id: string, content: string) =>
  call<Gist>(token, `/gists/${id}`, { method: 'PATCH', body: JSON.stringify({ files: { [GIST_FILE]: { content } } }) });
