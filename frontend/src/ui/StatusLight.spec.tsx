import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusLight } from './StatusLight';

describe('StatusLight', () => {
  it('should apply the correct CSS class for each color', () => {
    const { container, rerender } = render(
      <StatusLight color="blue" label="Ready" tooltip="All OK" />,
    );

    expect(container.querySelector('.status-light--blue')).toBeInTheDocument();

    rerender(<StatusLight color="green" label="OCR" tooltip="OCR OK" />);
    expect(container.querySelector('.status-light--green')).toBeInTheDocument();

    rerender(<StatusLight color="yellow" label="CPU" tooltip="CPU mode" />);
    expect(container.querySelector('.status-light--yellow')).toBeInTheDocument();

    rerender(<StatusLight color="red" label="Down" tooltip="Service down" />);
    expect(container.querySelector('.status-light--red')).toBeInTheDocument();
  });

  it('should render a single tooltip line as-is', () => {
    render(<StatusLight color="green" label="OCR" tooltip="OCR GPU ✓" />);

    expect(screen.getByText('OCR GPU ✓')).toBeInTheDocument();
  });

  it('should split tooltip by " | " into separate row elements', () => {
    render(
      <StatusLight
        color="blue"
        label="All"
        tooltip="OCR GPU ✓ | LM Studio ✓ | Kokoro ✓ | Supertone ✓"
      />,
    );

    expect(screen.getByText('OCR GPU ✓')).toBeInTheDocument();
    expect(screen.getByText('LM Studio ✓')).toBeInTheDocument();
    expect(screen.getByText('Kokoro ✓')).toBeInTheDocument();
    expect(screen.getByText('Supertone ✓')).toBeInTheDocument();
  });

  it('should render each tooltip line in its own .status-light__tooltip-row', () => {
    const { container } = render(
      <StatusLight color="yellow" label="Warn" tooltip="OCR CPU ⚠ | LM Studio ✓" />,
    );

    const rows = container.querySelectorAll('.status-light__tooltip-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toBe('OCR CPU ⚠');
    expect(rows[1].textContent).toBe('LM Studio ✓');
  });
});
