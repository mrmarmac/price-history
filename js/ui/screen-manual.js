/* Manual item entry (Flow B): the SAME wizard as receipt scanning, starting
 * at the meta-confirm step with one empty line — no separate data path. */

import { runWizard } from './screen-wizard.js';

export async function render(container) {
  return runWizard(container, { manual: true });
}
