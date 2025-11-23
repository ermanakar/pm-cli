import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface PMXConfig {
  model: string;
  systemPrompt?: string;
  openaiApiKey?: string;
}

const GLOBAL_CONFIG_PATH = path.join(os.homedir(), '.pmx', 'config.json');

export function loadPMXConfig(): PMXConfig {
  const defaults: PMXConfig = {
    model: process.env.PMX_MODEL || "gpt-5.1-chat-latest",
  };

  try {
    if (fs.existsSync(GLOBAL_CONFIG_PATH)) {
      const globalConfig = JSON.parse(fs.readFileSync(GLOBAL_CONFIG_PATH, 'utf-8'));
      return { ...defaults, ...globalConfig };
    }
  } catch (e) {
    // ignore error
  }

  return defaults;
}

export function saveGlobalConfig(config: Partial<PMXConfig>): void {
  const current = loadPMXConfig();
  // We only want to save the fields that are actually set, but for now merging with current is fine.
  // However, we should probably only save what's passed or merge with existing file content, not defaults.
  
  let existingFileContent = {};
  try {
    if (fs.existsSync(GLOBAL_CONFIG_PATH)) {
      existingFileContent = JSON.parse(fs.readFileSync(GLOBAL_CONFIG_PATH, 'utf-8'));
    }
  } catch (e) {}

  const newConfig = { ...existingFileContent, ...config };
  
  const dir = path.dirname(GLOBAL_CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(newConfig, null, 2));
}
