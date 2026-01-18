import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';
import {
  PALETTE,
  BANNER,
  selectPrompt,
  confirmPrompt,
  sectionHeader,
  displayKeyValue,
} from '../ui/index.js';

interface ReviewConfig {
  enabled: boolean;
  frontend: {
    provider: 'gemini' | 'codex' | 'none';
    model: string;
  };
  backend: {
    provider: 'codex' | 'gemini' | 'none';
    model: string;
  };
}

interface ProjectConfig {
  version: number;
  project: { name: string };
  workflow: Record<string, unknown>;
  git: Record<string, unknown>;
  test: Record<string, unknown>;
  review: ReviewConfig;
}

function findProjectRoot(): string | null {
  let currentDir = process.cwd();

  while (currentDir !== '/') {
    if (existsSync(join(currentDir, 'superspec', 'project.yaml'))) {
      return currentDir;
    }
    currentDir = join(currentDir, '..');
  }

  return null;
}

function loadConfig(projectRoot: string): ProjectConfig {
  const configPath = join(projectRoot, 'superspec', 'project.yaml');
  const content = readFileSync(configPath, 'utf-8');
  return YAML.parse(content) as ProjectConfig;
}

function saveConfig(projectRoot: string, config: ProjectConfig): void {
  const configPath = join(projectRoot, 'superspec', 'project.yaml');

  // Create YAML with comments
  const yamlContent = `# SuperSpec Project Configuration
version: ${config.version}

# Project settings
project:
  name: ${config.project.name}

# Workflow settings
workflow:
  require_design: ${config.workflow['require_design'] ?? true}
  require_validation: ${config.workflow['require_validation'] ?? true}
  strict_mode: ${config.workflow['strict_mode'] ?? false}

# Git settings
git:
  worktree_dir: ${config.git['worktree_dir'] ?? '.worktrees'}
  branch_prefix: ${config.git['branch_prefix'] ?? 'feature/'}

# Test settings
test:
  command: ${config.test['command'] ?? 'npm test'}
  coverage: ${config.test['coverage'] ?? false}

# External AI Review settings
# Enable to have external AI (Codex/Gemini) review your code after implementation
review:
  enabled: ${config.review.enabled}                     # Master switch for external AI review

  # Frontend task review (UI, components, styling)
  frontend:
    provider: ${config.review.frontend.provider}                 # gemini | codex | none
    model: ${config.review.frontend.model}

  # Backend task review (API, logic, data)
  backend:
    provider: ${config.review.backend.provider}                  # codex | gemini | none
    model: ${config.review.backend.model}
`;

  writeFileSync(configPath, yamlContent);
}

function displayCurrentSettings(config: ProjectConfig): void {
  console.log(sectionHeader('Current Review Settings', '⚙️'));
  console.log();

  const enabledStatus = config.review.enabled
    ? PALETTE.success('✓ Enabled')
    : PALETTE.midGray('✗ Disabled');

  displayKeyValue('External AI Review', enabledStatus);
  console.log();

  if (config.review.enabled) {
    console.log(PALETTE.white('  Frontend:'));
    displayKeyValue('    Provider', PALETTE.primary(config.review.frontend.provider));
    displayKeyValue('    Model', PALETTE.midGray(config.review.frontend.model));
    console.log();

    console.log(PALETTE.white('  Backend:'));
    displayKeyValue('    Provider', PALETTE.primary(config.review.backend.provider));
    displayKeyValue('    Model', PALETTE.midGray(config.review.backend.model));
  }

  console.log();
}

type SettingAction = 'toggle' | 'frontend' | 'backend' | 'exit';

export async function settingCommand(): Promise<void> {
  // Find project root
  const projectRoot = findProjectRoot();

  if (!projectRoot) {
    console.log(PALETTE.error('Error: SuperSpec not initialized in this directory.'));
    console.log(PALETTE.midGray('Run `superspec init` first.'));
    process.exit(1);
  }

  // Load config
  let config = loadConfig(projectRoot);

  // Ensure review config exists (for older configs)
  if (!config.review) {
    config.review = {
      enabled: false,
      frontend: { provider: 'gemini', model: 'gemini-3-pro-preview' },
      backend: { provider: 'codex', model: 'gpt-5.2-codex' },
    };
  }

  // Display banner
  console.log(BANNER);
  console.log();

  // Main loop
  let shouldExit = false;

  while (!shouldExit) {
    // Display current settings
    displayCurrentSettings(config);

    // Show menu
    const action = await selectPrompt<SettingAction>({
      message: 'What would you like to configure?',
      choices: [
        {
          name: config.review.enabled ? '🔴 Disable External AI Review' : '🟢 Enable External AI Review',
          value: 'toggle',
          description: config.review.enabled ? 'Turn off external AI code review' : 'Turn on external AI code review',
        },
        {
          name: '🎨 Configure Frontend Review',
          value: 'frontend',
          description: `Current: ${config.review.frontend.provider}`,
          disabled: !config.review.enabled ? 'Enable review first' : false,
        },
        {
          name: '⚙️  Configure Backend Review',
          value: 'backend',
          description: `Current: ${config.review.backend.provider}`,
          disabled: !config.review.enabled ? 'Enable review first' : false,
        },
        {
          name: '← Exit',
          value: 'exit',
        },
      ],
    });

    switch (action) {
      case 'toggle':
        config.review.enabled = !config.review.enabled;
        saveConfig(projectRoot, config);
        console.log();
        console.log(
          config.review.enabled
            ? PALETTE.success('✓ External AI Review enabled')
            : PALETTE.midGray('✗ External AI Review disabled')
        );
        console.log();
        break;

      case 'frontend':
        const frontendProvider = await selectPrompt<'gemini' | 'codex' | 'none'>({
          message: 'Select frontend review provider:',
          choices: [
            { name: 'Gemini', value: 'gemini', description: 'Google Gemini (recommended for UI/UX)' },
            { name: 'Codex', value: 'codex', description: 'OpenAI Codex' },
            { name: 'None', value: 'none', description: 'Skip frontend review' },
          ],
          default: config.review.frontend.provider,
        });

        config.review.frontend.provider = frontendProvider;

        if (frontendProvider === 'gemini') {
          config.review.frontend.model = 'gemini-3-pro-preview';
        } else if (frontendProvider === 'codex') {
          config.review.frontend.model = 'gpt-5.2-codex';
        }

        saveConfig(projectRoot, config);
        console.log();
        console.log(PALETTE.success(`✓ Frontend provider set to: ${frontendProvider}`));
        console.log();
        break;

      case 'backend':
        const backendProvider = await selectPrompt<'codex' | 'gemini' | 'none'>({
          message: 'Select backend review provider:',
          choices: [
            { name: 'Codex', value: 'codex', description: 'OpenAI Codex (recommended for logic/API)' },
            { name: 'Gemini', value: 'gemini', description: 'Google Gemini' },
            { name: 'None', value: 'none', description: 'Skip backend review' },
          ],
          default: config.review.backend.provider,
        });

        config.review.backend.provider = backendProvider;

        if (backendProvider === 'codex') {
          config.review.backend.model = 'gpt-5.2-codex';
        } else if (backendProvider === 'gemini') {
          config.review.backend.model = 'gemini-3-pro-preview';
        }

        saveConfig(projectRoot, config);
        console.log();
        console.log(PALETTE.success(`✓ Backend provider set to: ${backendProvider}`));
        console.log();
        break;

      case 'exit':
        shouldExit = true;
        break;
    }
  }

  console.log(PALETTE.midGray('Settings saved to superspec/project.yaml'));
  console.log();
}
