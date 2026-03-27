import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useImageUpload } from './useImageUpload';

describe('useImageUpload', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.URL.createObjectURL = vi.fn(() => 'blob:preview-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  const createFile = (name: string, type: string, sizeKB = 1) =>
    new File([new ArrayBuffer(sizeKB * 1024)], name, { type });

  it('should start with null state', () => {
    const { result } = renderHook(() => useImageUpload());

    expect(result.current.file).toBeNull();
    expect(result.current.preview).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should accept valid PNG file via onFileChange', () => {
    const { result } = renderHook(() => useImageUpload());
    const file = createFile('test.png', 'image/png');

    act(() => {
      const event = { target: { files: [file] } } as any;
      result.current.onFileChange(event);
    });

    expect(result.current.file).toBe(file);
    expect(result.current.preview).toBe('blob:preview-url');
    expect(result.current.error).toBeNull();
  });

  it('should accept valid JPEG file', () => {
    const { result } = renderHook(() => useImageUpload());
    const file = createFile('photo.jpg', 'image/jpeg');

    act(() => {
      result.current.onFileChange({ target: { files: [file] } } as any);
    });

    expect(result.current.file).toBe(file);
  });

  it('should reject unsupported file type', () => {
    const { result } = renderHook(() => useImageUpload());
    const file = createFile('doc.pdf', 'application/pdf');

    act(() => {
      result.current.onFileChange({ target: { files: [file] } } as any);
    });

    expect(result.current.file).toBeNull();
    expect(result.current.error).toContain('application/pdf');
  });

  it('should reject oversized files', () => {
    const { result } = renderHook(() => useImageUpload());
    const file = createFile('big.png', 'image/png', 11 * 1024); // 11 MB

    act(() => {
      result.current.onFileChange({ target: { files: [file] } } as any);
    });

    expect(result.current.file).toBeNull();
    expect(result.current.error).toContain('10');
  });

  it('should handle file via onDrop', () => {
    const { result } = renderHook(() => useImageUpload());
    const file = createFile('drop.png', 'image/png');

    act(() => {
      const event = {
        preventDefault: vi.fn(),
        dataTransfer: { files: [file] },
      } as any;
      result.current.onDrop(event);
    });

    expect(result.current.file).toBe(file);
    expect(result.current.preview).toBe('blob:preview-url');
  });

  it('should revoke previous preview when selecting a new file', () => {
    const { result } = renderHook(() => useImageUpload());
    const firstFile = createFile('first.png', 'image/png');
    const secondFile = createFile('second.png', 'image/png');

    act(() => {
      result.current.onFileChange({ target: { files: [firstFile] } } as any);
    });

    act(() => {
      result.current.onFileChange({ target: { files: [secondFile] } } as any);
    });

    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-url');
  });

  it('should accept image from clipboard paste', () => {
    const { result } = renderHook(() => useImageUpload());
    const file = createFile('image.png', 'image/png');

    act(() => {
      const event = new Event('paste') as any;
      event.clipboardData = {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
      };
      event.preventDefault = vi.fn();
      document.dispatchEvent(event);
    });

    expect(result.current.file).toBe(file);
    expect(result.current.preview).toBe('blob:preview-url');
  });

  it('should ignore paste without image files', () => {
    const { result } = renderHook(() => useImageUpload());

    act(() => {
      const event = new Event('paste') as any;
      event.clipboardData = {
        items: [{ kind: 'string', type: 'text/plain' }],
      };
      document.dispatchEvent(event);
    });

    expect(result.current.file).toBeNull();
  });

  it('should remove paste listener on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useImageUpload());

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('paste', expect.any(Function));
    removeSpy.mockRestore();
  });

  it('should clear all state', () => {
    const { result } = renderHook(() => useImageUpload());
    const file = createFile('test.png', 'image/png');

    act(() => {
      result.current.onFileChange({ target: { files: [file] } } as any);
    });

    act(() => {
      result.current.clear();
    });

    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-url');
    expect(result.current.file).toBeNull();
    expect(result.current.preview).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should revoke preview URL on unmount', () => {
    const { result, unmount } = renderHook(() => useImageUpload());
    const file = createFile('test.png', 'image/png');

    act(() => {
      result.current.onFileChange({ target: { files: [file] } } as any);
    });

    unmount();

    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-url');
  });
});
