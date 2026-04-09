#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templatesDir = path.resolve(packageRoot, 'templates');
const availableTemplates = listTemplates(templatesDir);
const template = resolveTemplateName(process.argv[2] ?? 'prompt-only', availableTemplates);
const targetDir = path.resolve(process.argv[3] ?? `./${template}-agent-app`);
const sourceDir = path.join(templatesDir, template);
const repoRoot = path.resolve(packageRoot, '..', '..');
const frameworkVersion = JSON.parse(
  fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
).version;
const localFramework = detectLocalFramework(repoRoot);

if (!fs.existsSync(sourceDir)) {
  console.error(`Unknown template: ${template}`);
  process.exit(1);
}

if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
  console.error(`Target directory is not empty: ${targetDir}`);
  process.exit(1);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.cpSync(sourceDir, targetDir, { recursive: true });
copyTemplateArtifacts({
  template,
  targetDir,
  localFramework,
  repoRoot,
});
rewriteGeneratedApp({
  targetDir,
  frameworkVersion,
  localFramework,
  repoRoot,
});

console.log(`Created ${template} template at ${targetDir}`);
if (localFramework) {
  console.log('Configured generated app to use local framework dependencies from this repo checkout.');
} else {
  console.log(`Configured generated app to use framework release version ${frameworkVersion}.`);
}

function copyTemplateArtifacts({ template, targetDir, localFramework, repoRoot }) {
  if (!localFramework || template !== 'cosmic-weather') {
    return;
  }

  const sourceLockfile = path.join(
    repoRoot,
    'examples',
    'cosmic-weather',
    'src-tauri',
    'Cargo.lock',
  );
  const targetLockfile = path.join(targetDir, 'src-tauri', 'Cargo.lock');

  if (fs.existsSync(sourceLockfile)) {
    fs.copyFileSync(sourceLockfile, targetLockfile);
  }
}

function detectLocalFramework(candidateRepoRoot) {
  return (
    fs.existsSync(path.join(candidateRepoRoot, 'packages', 'tauri-agent', 'package.json')) &&
    fs.existsSync(
      path.join(
        candidateRepoRoot,
        'src-tauri',
        'crates',
        'tauri-plugin-agent-runtime',
        'Cargo.toml',
      ),
    )
  );
}

function listTemplates(templatesRoot) {
  return fs
    .readdirSync(templatesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function resolveTemplateName(templateName, availableTemplateNames) {
  if (
    templateName.includes('/') ||
    templateName.includes('\\') ||
    templateName === '.' ||
    templateName === '..'
  ) {
    console.error(`Invalid template name: ${templateName}`);
    process.exit(1);
  }

  if (!availableTemplateNames.includes(templateName)) {
    console.error(
      `Unknown template: ${templateName}. Available templates: ${availableTemplateNames.join(', ')}`,
    );
    process.exit(1);
  }

  return templateName;
}

function rewriteGeneratedApp({ targetDir, frameworkVersion, localFramework, repoRoot }) {
  const packageJsonPath = path.join(targetDir, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    rewritePackageJsonDependency({
      packageJsonPath,
      frameworkVersion,
      localFramework,
      repoRoot,
    });
  }

  const cargoTomlPath = path.join(targetDir, 'src-tauri', 'Cargo.toml');
  if (fs.existsSync(cargoTomlPath)) {
    rewriteCargoTomlDependency({
      cargoTomlPath,
      frameworkVersion,
      localFramework,
      repoRoot,
    });
  }
}

function rewritePackageJsonDependency({
  packageJsonPath,
  frameworkVersion,
  localFramework,
  repoRoot,
}) {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (!pkg.dependencies?.['@dspo/tauri-agent']) {
    return;
  }

  const packageDir = fs.realpathSync(path.dirname(packageJsonPath));
  const tauriAgentDir = fs.realpathSync(path.join(repoRoot, 'packages', 'tauri-agent'));
  pkg.dependencies['@dspo/tauri-agent'] = localFramework
    ? `file:${normalizeRelativePath(path.relative(packageDir, tauriAgentDir))}`
    : `^${frameworkVersion}`;

  fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

function rewriteCargoTomlDependency({
  cargoTomlPath,
  frameworkVersion,
  localFramework,
  repoRoot,
}) {
  let cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
  const cargoDir = fs.realpathSync(path.dirname(cargoTomlPath));

  const pluginDependency = localFramework
    ? `{ path = "${normalizeRelativePath(
        path.relative(
          cargoDir,
          fs.realpathSync(path.join(repoRoot, 'src-tauri', 'crates', 'tauri-plugin-agent-runtime')),
        ),
      )}" }`
    : `{ version = "${frameworkVersion}" }`;
  cargoToml = cargoToml.replace(
    /^tauri-plugin-agent-runtime\s*=.*$/m,
    `tauri-plugin-agent-runtime = ${pluginDependency}`,
  );

  if (localFramework) {
    const winresDependency = `winres = { path = "${normalizeRelativePath(
      path.relative(
        cargoDir,
        fs.realpathSync(path.join(repoRoot, 'src-tauri', 'patches', 'winres')),
      ),
    )}" }`;
    cargoToml = cargoToml.replace(/^winres\s*=.*$/m, winresDependency);
  } else {
    cargoToml = cargoToml.replace(/^winres\s*=.*\n/m, '');
  }

  fs.writeFileSync(cargoTomlPath, cargoToml);
}

function normalizeRelativePath(relativePath) {
  return relativePath.split(path.sep).join('/');
}
