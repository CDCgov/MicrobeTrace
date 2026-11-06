import { definePreset } from '@primeuix/themes';
import Lara from '@primeuix/themes/lara';

// Angular's --define supplies this only for the selected development server.
// Ordinary builds and test servers retain the default blue appearance.
declare const MICROBETRACE_UI_COLOR: 'blue' | 'orange' | 'red' | 'yellow' | 'green' | 'purple';
export const uiColor = typeof MICROBETRACE_UI_COLOR === 'undefined'
  ? 'blue'
  : MICROBETRACE_UI_COLOR;

const primaryShade = uiColor === 'green' ? 800 : uiColor === 'red' ? 600 : uiColor === 'yellow' ? 300 : 400;

export const appThemePreset = uiColor !== 'blue' ? definePreset(Lara, {
  semantic: {
    primary: {
      50: `{${uiColor}.50}`,
      100: `{${uiColor}.100}`,
      200: `{${uiColor}.200}`,
      300: `{${uiColor}.300}`,
      400: `{${uiColor}.400}`,
      500: `{${uiColor}.500}`,
      600: `{${uiColor}.600}`,
      700: `{${uiColor}.700}`,
      800: `{${uiColor}.800}`,
      900: `{${uiColor}.900}`,
      950: `{${uiColor}.950}`,
      ...(uiColor === 'purple' ? {
        400: '#a219c1',
        500: '#452661',
        600: '#321b47',
        800: '#452661',
        900: '#321b47',
      } : {}),
    },
    colorScheme: {
      light: {
        primary: {
          color: `{primary.${primaryShade}}`,
          inverseColor: uiColor === 'red' || uiColor === 'green' || uiColor === 'purple' ? '#ffffff' : uiColor === 'yellow' ? '#422006' : '#431407',
          hoverColor: `{primary.${primaryShade + 100}}`,
          activeColor: `{primary.${Math.min(primaryShade + 200, 950)}}`,
        },
        highlight: {
          background: '{primary.50}',
          focusBackground: '{primary.100}',
          color: '{primary.800}',
          focusColor: '{primary.900}',
        },
      },
    },
  },
}) : Lara;
