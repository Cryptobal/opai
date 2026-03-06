/**
 * Font registration for @react-pdf/renderer
 * Registers Plus Jakarta Sans and JetBrains Mono from public/fonts/
 */

import { Font } from '@react-pdf/renderer';
import * as path from 'path';

let registered = false;

export function ensureFontsRegistered(): void {
  if (registered) return;

  const fontsDir = path.join(process.cwd(), 'public', 'fonts');

  Font.register({
    family: 'PlusJakartaSans',
    fonts: [
      { src: path.join(fontsDir, 'PlusJakartaSans-Regular.ttf'), fontWeight: 400 },
      { src: path.join(fontsDir, 'PlusJakartaSans-Medium.ttf'), fontWeight: 500 },
      { src: path.join(fontsDir, 'PlusJakartaSans-SemiBold.ttf'), fontWeight: 600 },
      { src: path.join(fontsDir, 'PlusJakartaSans-Bold.ttf'), fontWeight: 700 },
      { src: path.join(fontsDir, 'PlusJakartaSans-ExtraBold.ttf'), fontWeight: 800 },
    ],
  });

  Font.register({
    family: 'JetBrainsMono',
    fonts: [
      { src: path.join(fontsDir, 'JetBrainsMono-Regular.ttf'), fontWeight: 400 },
      { src: path.join(fontsDir, 'JetBrainsMono-Medium.ttf'), fontWeight: 500 },
    ],
  });

  registered = true;
}
