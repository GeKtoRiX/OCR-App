import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

const useImageUploadMock = vi.fn();
const useOCRMock = vi.fn();
const useHealthStatusMock = vi.fn();

vi.mock('./viewmodel/useImageUpload', () => ({
  useImageUpload: () => useImageUploadMock(),
}));

vi.mock('./viewmodel/useOCR', () => ({
  useOCR: () => useOCRMock(),
}));

vi.mock('./viewmodel/useHealthStatus', () => ({
  useHealthStatus: () => useHealthStatusMock(),
}));

describe('App', () => {
  beforeEach(() => {
    useImageUploadMock.mockReturnValue({
      file: null,
      preview: null,
      error: null,
      onFileChange: vi.fn(),
      onDrop: vi.fn(),
      clear: vi.fn(),
    });

    useOCRMock.mockReturnValue({
      status: 'idle',
      result: null,
      error: null,
      run: vi.fn(),
      reset: vi.fn(),
    });

    useHealthStatusMock.mockReturnValue({
      color: 'blue',
      tooltip: 'Все сервисы доступны',
    });
  });

  it('should render hero heading and subtitle', () => {
    render(<App />);

    expect(screen.getByText('OCR Service')).toBeInTheDocument();
    expect(
      screen.getByText(/Профессиональное распознавание изображений/i),
    ).toBeInTheDocument();
  });

  it('should render action buttons', () => {
    render(<App />);

    expect(screen.getByText('Распознать')).toBeInTheDocument();
    expect(screen.getByText('Очистить')).toBeInTheDocument();
  });

  it('should have disabled "Распознать" button initially', () => {
    render(<App />);

    expect(screen.getByText('Распознать')).toBeDisabled();
  });

  it('should render upload and result placeholders', () => {
    render(<App />);

    expect(
      screen.getByText(/Перетащите изображение в рабочую область/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Здесь появится структурированный вывод/i),
    ).toBeInTheDocument();
  });
});
