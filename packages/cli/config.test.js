import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  loadDefaultConfig,
  mergeConfigs,
  parseModelOverrides,
} from './config.js';

describe('CLI config', () => {
  it('loads packaged default models', () => {
    const config = loadDefaultConfig();

    assert.equal(config.models.explore, 'gpt-5.4-mini');
    assert.equal(config.models.outline, 'claude-sonnet-4-6');
  });

  it('merges configs with later model values taking precedence', () => {
    const merged = mergeConfigs(
      { models: { explore: 'default-explore', outline: 'default-outline' } },
      { models: { explore: 'local-explore' } },
      { models: { outline: 'cli-outline' } },
    );

    assert.deepEqual(merged.models, {
      explore: 'local-explore',
      outline: 'cli-outline',
    });
  });

  it('parses comma-separated model overrides', () => {
    assert.deepEqual(
      parseModelOverrides('explore=gpt-5.4,outline=claude-sonnet-4-6'),
      {
        models: {
          explore: 'gpt-5.4',
          outline: 'claude-sonnet-4-6',
        },
      },
    );
  });

  it('rejects malformed model overrides', () => {
    assert.throws(
      () => parseModelOverrides('explore'),
      /Use stage=model/,
    );
    assert.throws(
      () => parseModelOverrides('unknown=gpt-5.4'),
      /unknown model key/,
    );
  });
});
