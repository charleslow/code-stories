import fs from 'fs';
import path from 'path';

export function getCheckpointStatus(generationDir, checkpoints) {
  const missing = [];
  let completed = 0;

  for (const cp of checkpoints) {
    const filePath = path.join(generationDir, cp.file);
    if (!fs.existsSync(filePath)) {
      missing.push(`${cp.file} (missing)`);
      break;
    }

    if (cp.checkpoint) {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (!content.includes(cp.checkpoint)) {
        missing.push(`${cp.file} (missing marker ${cp.checkpoint})`);
        break;
      }
    }

    completed++;
  }

  return {
    completed,
    complete: completed === checkpoints.length,
    missing,
  };
}

export function formatMissingCheckpoints(status) {
  if (!status.missing.length) return '';
  return `\nmissing checkpoints: ${status.missing.join(', ')}`;
}
