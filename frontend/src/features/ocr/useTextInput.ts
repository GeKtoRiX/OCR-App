import { useState } from 'react';

export function useTextInput() {
  const [text, setText] = useState('');
  const [filename, setFilename] = useState('');

  const clear = () => {
    setText('');
    setFilename('');
  };

  const canSubmit = text.trim().length > 0;

  return {
    text,
    setText,
    filename,
    setFilename,
    clear,
    canSubmit,
  };
}
