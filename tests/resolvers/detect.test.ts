import { describe, it, expect } from 'vitest';
import { detectForge } from '../../src/resolvers/detect';

describe('detectForge', () => {
  it('should detect GitHub repos', () => {
    const config = detectForge('https://github.com/auths-dev/auths');
    expect(config).toEqual({
      type: 'github',
      baseUrl: 'https://api.github.com',
      owner: 'bordumb',
      repo: 'auths',
    });
  });

  it('should detect GitLab repos', () => {
    const config = detectForge('https://gitlab.com/org/project');
    expect(config).toEqual({
      type: 'gitlab',
      baseUrl: 'https://gitlab.com',
      owner: 'org',
      repo: 'project',
    });
  });

  it('should default to Gitea for unknown hosts', () => {
    const config = detectForge('https://git.example.com/user/repo');
    expect(config).toEqual({
      type: 'gitea',
      baseUrl: 'https://git.example.com',
      owner: 'user',
      repo: 'repo',
    });
  });

  it('should strip .git suffix', () => {
    const config = detectForge('https://github.com/auths-dev/auths.git');
    expect(config).not.toBeNull();
    expect(config!.repo).toBe('auths');
  });

  it('should strip trailing slash', () => {
    const config = detectForge('https://github.com/auths-dev/auths/');
    expect(config).not.toBeNull();
    expect(config!.repo).toBe('auths');
  });

  it('should return null for invalid URLs', () => {
    expect(detectForge('not-a-url')).toBeNull();
  });

  it('should return null for URLs without owner/repo', () => {
    expect(detectForge('https://github.com')).toBeNull();
    expect(detectForge('https://github.com/onlyone')).toBeNull();
  });

  it('should use forgeHint to override detection', () => {
    const config = detectForge('https://github.com/auths-dev/auths', 'gitea');
    expect(config).not.toBeNull();
    expect(config!.type).toBe('gitea');
    expect(config!.baseUrl).toBe('https://github.com');
  });

  it('should handle HTTP URLs', () => {
    const config = detectForge('http://git.local:3000/user/repo');
    expect(config).not.toBeNull();
    expect(config!.type).toBe('gitea');
    expect(config!.baseUrl).toBe('http://git.local:3000');
  });

  it('should handle URLs with extra path segments', () => {
    const config = detectForge('https://github.com/auths-dev/auths/tree/main');
    expect(config).not.toBeNull();
    expect(config!.owner).toBe('bordumb');
    expect(config!.repo).toBe('auths');
  });
});
