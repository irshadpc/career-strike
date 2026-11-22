import fs from 'node:fs';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { VERSION } from '../core/version.js';

export interface McpbManifest {
  manifest_version: string;
  name: string;
  display_name: string;
  version: string;
  description: string;
  author: { name: string; url?: string };
  server: {
    type: 'stdio';
    command: string;
    args: string[];
    env?: Record<string, string>;
  };
}

/**
 * Creates an official .mcpb desktop extension bundle for Claude Desktop.
 * Double-clicking or dropping this bundle installs Career Strike MCP server
 * directly without editing any JSON config files.
 */
export function buildMcpbBundle(outputFilePath?: string): string {
  const manifest: McpbManifest = {
    manifest_version: '0.1',
    name: 'career-strike',
    display_name: 'Career Strike Vault',
    version: VERSION,
    description:
      'Local-first Career Vault & Private Job Hunting Operating System for Claude Desktop. Candidate data never leaves this machine.',
    author: {
      name: 'Career Strike',
      url: 'https://github.com/irshadpc/career-strike',
    },
    server: {
      type: 'stdio',
      command: 'career-strike',
      args: ['mcp', '--client', 'claude'],
    },
  };

  const readme = [
    '# Career Strike MCP Bundle',
    '',
    'This desktop extension integrates your local Career Strike vault directly into Claude Desktop.',
    'It runs completely on your computer via local stdio and never sends your resume or target',
    'search details to external servers.',
    '',
    'To connect:',
    '1. Open Claude Desktop.',
    '2. Drag and drop `career-strike.mcpb` into Claude Desktop, or install it via Developer settings.',
    '3. Claude now has secure, local access to your public postings search and approved candidate context.',
  ].join('\n');

  const files: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
    'README.md': strToU8(readme),
  };

  const zipped = zipSync(files, { level: 9 });
  const outPath = outputFilePath ?? path.resolve('dist', 'career-strike.mcpb');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, zipped);

  return outPath;
}
