export function buildCodexExecArgs({ model, cwd, generationDir }) {
  const args = ['exec'];
  if (model) args.push('--model', model);
  args.push(
    '--sandbox', 'danger-full-access',
    '--skip-git-repo-check',
    '-C', cwd,
    '--add-dir', generationDir,
    '-'
  );
  return args;
}
