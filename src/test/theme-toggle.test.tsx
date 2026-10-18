import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider, useTheme } from '@/app/theme';
import { ThemeToggle } from '@/shared/ui';

function ThemeState() {
  const { theme } = useTheme();
  return <output aria-label="Joriy tema">{theme}</output>;
}

describe('theme switching', () => {
  beforeEach(() => {
    window.localStorage.removeItem('fincore.theme');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.removeProperty('color-scheme');
  });

  afterEach(() => {
    window.localStorage.removeItem('fincore.theme');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.removeProperty('color-scheme');
  });

  it('starts in the current light theme and persists a switch to dark mode', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeToggle />
        <ThemeState />
      </ThemeProvider>,
    );

    expect(screen.getByLabelText('Joriy tema')).toHaveTextContent('light');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');

    await user.click(screen.getByRole('button', { name: 'Tungi rejimga o‘tish' }));

    expect(screen.getByLabelText('Joriy tema')).toHaveTextContent('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(window.localStorage.getItem('fincore.theme')).toBe('dark');
    expect(screen.getByRole('button', { name: 'Kunduzgi rejimga o‘tish' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('restores a saved dark theme before rendering its children', async () => {
    window.localStorage.setItem('fincore.theme', 'dark');

    render(
      <ThemeProvider>
        <ThemeState />
      </ThemeProvider>,
    );

    expect(screen.getByLabelText('Joriy tema')).toHaveTextContent('dark');
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'dark'));
  });
});
