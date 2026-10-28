import { createTheme, type MantineColorsTuple } from '@mantine/core'

const mtnYellow: MantineColorsTuple = [
  '#fffbea',
  '#fff3c4',
  '#ffe88a',
  '#ffdc4f',
  '#ffd323',
  '#ffcb05',
  '#e3b400',
  '#b88f00',
  '#8c6b00',
  '#5f4800',
]

export const fibrexTheme = createTheme({
  primaryColor: 'mtn',
  primaryShade: 5,
  colors: { mtn: mtnYellow },
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  headings: {
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  defaultRadius: 'md',
  cursorType: 'pointer',
})
