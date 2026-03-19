import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DropZone } from './DropZone';

describe('DropZone', () => {
  const defaultProps = {
    preview: null,
    onFileChange: vi.fn(),
    onDrop: vi.fn(),
  };

  it('should render placeholder text when no preview', () => {
    render(<DropZone {...defaultProps} />);

    expect(
      screen.getByText(/Перетащите изображение в рабочую область/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/PNG, JPEG/)).toBeInTheDocument();
  });

  it('should render preview image when preview is set', () => {
    render(
      <DropZone
        {...defaultProps}
        preview="blob:test-url"
        fileName="invoice.png"
        fileMeta="2.4 MB · image/png"
      />,
    );

    const img = screen.getByAltText('Предпросмотр загруженного изображения') as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toContain('blob:test-url');
    expect(screen.getByText('invoice.png')).toBeInTheDocument();
  });

  it('should apply disabled class when disabled', () => {
    const { container } = render(<DropZone {...defaultProps} disabled />);

    expect(container.firstChild).toHaveClass('dropzone--disabled');
  });
});
