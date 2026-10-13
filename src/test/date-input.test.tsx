import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Input } from '@/shared/ui';

function ControlledDateInput() {
  const [value, setValue] = useState('2026-08-20');
  return (
    <>
      <label htmlFor="test-date">Sana</label>
      <Input
        id="test-date"
        type="date"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </>
  );
}

describe('Neumorphism date input', () => {
  it('opens the custom calendar and keeps the native YYYY-MM-DD value in sync', async () => {
    const user = userEvent.setup();
    render(<ControlledDateInput />);

    const input = screen.getByLabelText('Sana') as HTMLInputElement;
    await user.click(input);

    expect(screen.getByRole('dialog', { name: 'Sana tanlash' })).toBeInTheDocument();
    const day = screen
      .getAllByRole('gridcell')
      .find((candidate) => candidate.textContent === '15' && !candidate.hasAttribute('disabled'));
    expect(day).toBeDefined();
    await user.click(day!);

    expect(input.value).toBe('2026-08-15');
    expect(screen.queryByRole('dialog', { name: 'Sana tanlash' })).not.toBeInTheDocument();
  });

  it('supports keyboard selection without opening the browser-native picker', async () => {
    const user = userEvent.setup();
    render(<ControlledDateInput />);

    const input = screen.getByLabelText('Sana') as HTMLInputElement;
    input.focus();
    await user.keyboard('{Enter}{ArrowRight}{Enter}');

    expect(input.value).toBe('2026-08-21');
    expect(screen.queryByRole('dialog', { name: 'Sana tanlash' })).not.toBeInTheDocument();
  });
});
