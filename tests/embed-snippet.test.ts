import { describe, it, expect } from 'vitest';
import { buildEmbed, canonicalRepoUrl, previewDocument, VERSION, SRI } from '../examples/embed-snippet';

describe('buildEmbed', () => {
  const CANON = 'https://github.com/auths-dev/auths';

  it('normalizes every GitHub input form to the same canonical repo + snippet', () => {
    const inputs = [
      'https://github.com/auths-dev/auths',
      'https://github.com/auths-dev/auths.git',
      'https://github.com/auths-dev/auths/',
      'https://github.com/auths-dev/auths/tree/main',
      'https://github.com/auths-dev/auths?x=1#y',
      'github.com/auths-dev/auths',
      'auths-dev/auths',
      'auths-dev/auths.git',
    ];
    for (const input of inputs) {
      const r = buildEmbed(input);
      expect(r.ok, `input: ${input}`).toBe(true);
      if (r.ok) {
        expect(r.repo, `input: ${input}`).toBe(CANON);
        expect(r.snippet).toContain(`repo="${CANON}"`);
      }
    }
  });

  it('emits a pinned, integrity-protected, crossorigin <script>', () => {
    const r = buildEmbed('auths-dev/auths');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.snippet).toContain(`@auths-dev/verify@${VERSION}/dist/auths-verify.mjs`);
    expect(r.snippet).toContain(`integrity="${SRI}"`);
    expect(r.snippet).toContain('crossorigin="anonymous"');
    expect(r.snippet).toContain('<auths-verify');
    expect(r.snippet).not.toContain('@latest');
  });

  it('does not emit a forge attribute for auto-detectable GitHub', () => {
    const r = buildEmbed('https://github.com/auths-dev/auths');
    expect(r.ok && r.snippet.includes('forge=')).toBe(false);
  });

  it('keeps the host and omits forge for a self-hosted Gitea full URL', () => {
    const r = buildEmbed('https://git.example.com/user/repo');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.forge).toBe('gitea');
    expect(r.repo).toBe('https://git.example.com/user/repo');
    expect(r.snippet).not.toContain('forge='); // gitea is the auto-detected default
  });

  it('emits forge="gitea" when overriding a github.com URL', () => {
    const r = buildEmbed('https://github.com/org/repo', 'gitea');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.forge).toBe('gitea');
    expect(r.snippet).toContain('forge="gitea"');
  });

  it('rejects unparseable input with a validation error', () => {
    const r = buildEmbed('not a repo');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/owner\/repo/);
  });

  it('rejects empty input', () => {
    expect(buildEmbed('   ').ok).toBe(false);
  });
});

describe('previewDocument', () => {
  it('renders a sandboxed-iframe doc that loads the pinned CDN bundle', () => {
    const doc = previewDocument('https://github.com/auths-dev/auths');
    expect(doc).toContain('<!DOCTYPE html>');
    expect(doc).toContain(`@auths-dev/verify@${VERSION}/dist/auths-verify.mjs`);
    expect(doc).toContain('crossorigin="anonymous"');
    expect(doc).toContain('<auths-verify repo="https://github.com/auths-dev/auths">');
  });

  it('omits the integrity attribute in the preview (renders published bytes)', () => {
    expect(previewDocument('https://github.com/o/r')).not.toContain('integrity=');
  });

  it('passes through a forge attribute', () => {
    expect(previewDocument('https://github.com/o/r', ' forge="gitea"')).toContain('forge="gitea"');
  });

  it('reuses the forgeAttr from buildEmbed so snippet and preview agree', () => {
    const r = buildEmbed('https://github.com/org/repo', 'gitea');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const doc = previewDocument(r.repo, r.forgeAttr);
    expect(doc).toContain('forge="gitea"');
    expect(doc).toContain(`repo="${r.repo}"`);
  });
});

describe('canonicalRepoUrl', () => {
  it('maps GitHub api base back to the github.com web origin', () => {
    expect(
      canonicalRepoUrl({ type: 'github', baseUrl: 'https://api.github.com', owner: 'o', repo: 'r' }),
    ).toBe('https://github.com/o/r');
  });

  it('uses the forge web origin for Gitea', () => {
    expect(
      canonicalRepoUrl({ type: 'gitea', baseUrl: 'https://git.example.com', owner: 'o', repo: 'r' }),
    ).toBe('https://git.example.com/o/r');
  });
});
