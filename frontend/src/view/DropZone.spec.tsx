import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DropZone } from './DropZone';

describe('DropZone', () => {
  const defaultProps = {
    preview: null,
    onFileChange: vi.fn(),
    onDrop: vi.fn(),
  };

  it('should render placeholder text when no preview', () => {
    render(<DropZone {...defaultProps} />);

    expect(screen.getByText('Drop an image here')).toBeInTheDocument();
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

    const img = screen.getByAltText('Uploaded image preview') as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toContain('blob:test-url');
    expect(screen.getByText('invoice.png')).toBeInTheDocument();
  });

  it('should apply disabled class when disabled', () => {
    const { container } = render(<DropZone {...defaultProps} disabled />);

    expect(container.firstChild).toHaveClass('dropzone--disabled');
  });

  it('should forward file input changes', () => {
    const onFileChange = vi.fn();
    const { container } = render(<DropZone {...defaultProps} onFileChange={onFileChange} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['img'], 'test.png', { type: 'image/png' });

    fireEvent.change(input, { target: { files: [file] } });

    expect(onFileChange).toHaveBeenCalled();
  });

  it('should handle drag over, leave and drop events', () => {
    const onDrop = vi.fn();
    const { container } = render(<DropZone {...defaultProps} onDrop={onDrop} />);
    const dropzone = container.firstChild as HTMLElement;
    const file = new File(['img'], 'test.png', { type: 'image/png' });

    fireEvent.dragOver(dropzone);
    expect(dropzone).toHaveClass('dropzone--active');

    fireEvent.dragLeave(dropzone);
    expect(dropzone).not.toHaveClass('dropzone--active');

    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    expect(onDrop).toHaveBeenCalled();
  });
});
