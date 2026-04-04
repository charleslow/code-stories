/**
 * Register additional Prism language grammars for syntax highlighting.
 *
 * prism-react-renderer bundles only a subset of languages. We import the
 * official prismjs grammar files for languages our EXT_TO_LANGUAGE map
 * references but aren't bundled (Java, Ruby, Bash).
 *
 * The prismjs component files are IIFEs that register on a global `Prism`.
 * We expose the prism-react-renderer instance so they attach there.
 * This module must be imported before any component that uses <Highlight>.
 */
import { Prism } from 'prism-react-renderer';

(typeof globalThis !== 'undefined' ? globalThis : window).Prism = Prism;
