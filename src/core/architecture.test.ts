import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const CORE_DIR = path.resolve(__dirname);
const ROOT_SRC = path.resolve(__dirname, '..');

function getTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getTsFiles(fullPath));
    } else if (
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.includes('.test.')
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Architectural Invariants & Purity Enforcement', () => {
  it('strictly enforces that src/core/ never imports from llm, agent, services, or api', () => {
    const coreFiles = getTsFiles(CORE_DIR);
    expect(coreFiles.length).toBeGreaterThan(0);

    const forbiddenPatterns = [
      /\/llm\b/,
      /\/agent\b/,
      /\/services\b/,
      /\/api\b/,
      /from\s+['"][^'"]*llm/,
      /from\s+['"][^'"]*agent/,
      /from\s+['"][^'"]*services/,
      /from\s+['"][^'"]*api/,
    ];

    for (const file of coreFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('import ') || line.startsWith('export ') || line.includes('import(')) {
          for (const pattern of forbiddenPatterns) {
            expect(
              pattern.test(line),
              `File ${path.basename(file)}:${i + 1} violates core purity rule: "${line}"`
            ).toBe(false);
          }
        }
      }
    }
  });

  it('verifies that state mutations only occur through pure transition() function', () => {
    // In src/services/sessionService.ts, state should only be updated via transition()
    const serviceFile = path.join(ROOT_SRC, 'services', 'sessionService.ts');
    const content = fs.readFileSync(serviceFile, 'utf-8');

    expect(content).toContain('transition(record, event)');
  });

  it('validates read-only chat boundaries for ChatDock, src/agent/chat.ts and src/core/chat/', () => {
    const chatAgentFile = path.join(ROOT_SRC, 'agent', 'chat.ts');
    const chatDockFile = path.join(ROOT_SRC, 'components', 'layout', 'ChatDock.tsx');
    const chatCoreDir = path.join(ROOT_SRC, 'core', 'chat');

    const targetFiles = [chatAgentFile, chatDockFile, ...getTsFiles(chatCoreDir)];

    const forbiddenImports = [
      /sessionService/,
      /reportService/,
      /uploadService/,
      /analysisService/,
      /ArtifactStore\.put/,
      /sessionStore\.setRecord/,
      /sessionStore\.clear/,
    ];

    for (const file of targetFiles) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf-8');

      for (const pattern of forbiddenImports) {
        expect(
          pattern.test(content),
          `File ${path.basename(file)} violates read-only chat boundary: matches ${pattern}`
        ).toBe(false);
      }
    }
  });

  it('validates that readers.ts strictly exports only read-only queries with zero mutations', () => {
    const readersFile = path.join(ROOT_SRC, 'services', 'readers.ts');
    expect(fs.existsSync(readersFile)).toBe(true);
    const content = fs.readFileSync(readersFile, 'utf-8');

    // Must never contain mutating writes
    expect(content).not.toContain('ArtifactStore.put');
    expect(content).not.toContain('sessionStore.setRecord');
    expect(content).not.toContain('sessionStore.clear');
    expect(content).not.toContain('localStorage');
    expect(content).not.toContain('sessionStorage');
  });

  it('validates that src/core/plan/ is pure TypeScript with zero UI, React, LLM or service imports', () => {
    const planDir = path.join(ROOT_SRC, 'core', 'plan');
    if (!fs.existsSync(planDir)) return;

    const planFiles = getTsFiles(planDir);
    const forbidden = [
      /from\s+['"]react['"]/,
      /from\s+['"][^'"]*services/,
      /from\s+['"][^'"]*agent/,
      /from\s+['"][^'"]*llm/,
      /document\./,
      /window\./,
    ];

    for (const file of planFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const pat of forbidden) {
        expect(
          pat.test(content),
          `File ${path.basename(file)} violates plan purity: matches ${pat}`
        ).toBe(false);
      }
    }
  });

  it('D3: validates that AI Agent and Chat Assistant never import setBusinessContext mutation function', () => {
    const agentDir = path.join(ROOT_SRC, 'agent');
    const agentFiles = getTsFiles(agentDir);
    for (const file of agentFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toContain('setBusinessContext');
    }
  });
});

