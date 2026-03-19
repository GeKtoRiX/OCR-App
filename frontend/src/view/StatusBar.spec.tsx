import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBar } from './StatusBar';

describe('StatusBar', () => {
  it('should render nothing for idle status', () => {
    const { container } = render(<StatusBar status="idle" error={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('should render loading indicator', () => {
    render(<StatusBar status="loading" error={null} />);
    expect(screen.getByText('Распознавание')).toBeInTheDocument();
  });

  it('should render success label', () => {
    render(<StatusBar status="success" error={null} />);
    expect(screen.getByText('Готово')).toBeInTheDocument();
  });

  it('should render error message', () => {
    render(<StatusBar status="error" error="Something went wrong" />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('should apply correct CSS class for each status', () => {
    const { container, rerender } = render(
      <StatusBar status="loading" error={null} />,
    );
    expect(container.firstChild).toHaveClass('status--loading');

    rerender(<StatusBar status="success" error={null} />);
    expect(container.firstChild).toHaveClass('status--success');

    rerender(<StatusBar status="error" error="err" />);
    expect(container.firstChild).toHaveClass('status--error');
  });
});
