import React, { useState } from "react";

interface InputTaggerProps {
  tags: string[];
  onChange: (newLabels: string[]) => void;
  label?: string;
}

const InputTagger: React.FC <InputTaggerProps> = ({
  tags,
  onChange,
  label,
}) => {
  const [input, setInput] = useState("");

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Enter" || e.key === ",") && input.trim() !== "") {
      e.preventDefault();
      if (!tags.includes(input.trim())) {
        onChange([...tags, input.trim()]);
        setInput("");
      }
    }
  }

  function handleRemove(labelToRemove: string) {
    onChange(tags.filter((l) => l !== labelToRemove));
  }

  return (
    <div className="input-tagger">
      <label className="input-tagger__label">
        {label || 'Rótulos/Classes'} <span style={{ color: '#ff6b6b' }}>*</span>
      </label>
      <div className="input-tagger__container">
        {tags.map((tag) => (
          <span key={tag} className="input-tagger__chip">
            {tag}
            <button
              type="button"
              onClick={() => handleRemove(tag)}
              className="input-tagger__remove"
            >
              &times;
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite + Enter"
          className="input-tagger__input"
        />
      </div>
    </div>
  );
}

export default InputTagger;