import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSessionHistory } from './useSessionHistory';

const makeFile = (name: string) => new File(['data'], name, { type: 'image/png' });
const makeResult = (name: string) => ({
  rawText: `raw ${name}`,
  markdown: `# ${name}`,
  filename: name,
});

describe('useSessionHistory', () => {
  it('should start with empty entries and null activeId', () => {
    const { result } = renderHook(() => useSessionHistory());

    expect(result.current.entries).toEqual([]);
    expect(result.current.activeId).toBeNull();
  });

  it('should add an entry with correct data and set it as active', () => {
    const { result } = renderHook(() => useSessionHistory());
    const file = makeFile('test.png');
    const res = makeResult('test.png');

    act(() => {
      result.current.addEntry(file, res);
    });

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].file).toBe(file);
    expect(result.current.entries[0].result).toEqual(res);
    expect(result.current.entries[0].id).toBeTruthy();
    expect(result.current.activeId).toBe(result.current.entries[0].id);
  });

  it('should prepend new entries (most recent first)', () => {
    const { result } = renderHook(() => useSessionHistory());

    act(() => {
      result.current.addEntry(makeFile('first.png'), makeResult('first.png'));
    });
    act(() => {
      result.current.addEntry(makeFile('second.png'), makeResult('second.png'));
    });

    expect(result.current.entries).toHaveLength(2);
    expect(result.current.entries[0].result.filename).toBe('second.png');
    expect(result.current.entries[1].result.filename).toBe('first.png');
  });

  it('should set activeId to the newest entry after each add', () => {
    const { result } = renderHook(() => useSessionHistory());

    act(() => {
      result.current.addEntry(makeFile('a.png'), makeResult('a.png'));
    });
    const firstId = result.current.activeId;

    act(() => {
      result.current.addEntry(makeFile('b.png'), makeResult('b.png'));
    });
    const secondId = result.current.activeId;

    expect(firstId).not.toBe(secondId);
    expect(secondId).toBe(result.current.entries[0].id);
  });

  it('should change activeId via selectEntry', () => {
    const { result } = renderHook(() => useSessionHistory());

    act(() => {
      result.current.addEntry(makeFile('a.png'), makeResult('a.png'));
      result.current.addEntry(makeFile('b.png'), makeResult('b.png'));
    });

    const olderEntryId = result.current.entries[1].id;

    act(() => {
      result.current.selectEntry(olderEntryId);
    });

    expect(result.current.activeId).toBe(olderEntryId);
  });

  it('should assign a unique id to each entry', () => {
    const { result } = renderHook(() => useSessionHistory());

    act(() => {
      result.current.addEntry(makeFile('a.png'), makeResult('a.png'));
      result.current.addEntry(makeFile('b.png'), makeResult('b.png'));
      result.current.addEntry(makeFile('c.png'), makeResult('c.png'));
    });

    const ids = result.current.entries.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should record processedAt as a Date instance', () => {
    const { result } = renderHook(() => useSessionHistory());

    act(() => {
      result.current.addEntry(makeFile('x.png'), makeResult('x.png'));
    });

    expect(result.current.entries[0].processedAt).toBeInstanceOf(Date);
  });
});
