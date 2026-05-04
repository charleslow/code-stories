export function buildClaudePrintArgs({ model, generationDir }) {
  const args = [
    '--print',
    '--add-dir',
    generationDir,
  ];
  if (model) args.push('--model', model);
  return args;
}
