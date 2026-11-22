import fs from 'node:fs';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildMcpbBundle } from '../../src/mcp/bundle.js';
import { tempDir } from '../helpers.js';

describe('mcp bundle for claude desktop', () => {
  it('packages the MCP server into a valid .mcpb desktop extension archive', () => {
    const out = path.join(tempDir('mcpb-'), 'career-strike.mcpb');
    const created = buildMcpbBundle(out);
    expect(fs.existsSync(created)).toBe(true);

    const buffer = fs.readFileSync(created);
    expect(buffer.length).toBeGreaterThan(100);

    // Unzip and verify contents
    const unzipped = unzipSync(new Uint8Array(buffer));
    expect(unzipped['manifest.json']).toBeDefined();
    expect(unzipped['README.md']).toBeDefined();

    const manifest = JSON.parse(strFromU8(unzipped['manifest.json']!));
    expect(manifest.name).toBe('career-strike');
    expect(manifest.display_name).toBe('Career Strike Vault');
    expect(manifest.server.type).toBe('stdio');
    expect(manifest.server.command).toBe('career-strike');
    expect(manifest.server.args).toEqual(['mcp', '--client', 'claude']);
  });
});
