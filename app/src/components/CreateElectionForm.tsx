import { type FormEvent, useState } from 'react';

export type CreateElectionPayload = {
  name: string;
  endTime: number;
  options: string[];
};

type Props = {
  onSubmit: (payload: CreateElectionPayload) => Promise<void>;
  isSubmitting: boolean;
  disabled: boolean;
};

export function CreateElectionForm({ onSubmit, isSubmitting, disabled }: Props) {
  const [name, setName] = useState('');
  const [deadline, setDeadline] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [error, setError] = useState<string | null>(null);

  const handleOptionChange = (index: number, value: string) => {
    setOptions((prev) => prev.map((entry, idx) => (idx === index ? value : entry)));
  };

  const handleRemoveOption = (index: number) => {
    setOptions((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleAddOption = () => {
    if (options.length >= 8) {
      return;
    }
    setOptions((prev) => [...prev, '']);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) {
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Election name cannot be empty.');
      return;
    }
    const parsedOptions = options.map((option) => option.trim()).filter((option) => option.length > 0);
    if (parsedOptions.length < 2) {
      setError('Provide at least two options.');
      return;
    }
    if (parsedOptions.length > 8) {
      setError('You can list at most eight options.');
      return;
    }
    if (!deadline) {
      setError('Please select an end time.');
      return;
    }
    const endTime = new Date(deadline).getTime();
    if (Number.isNaN(endTime) || endTime <= Date.now()) {
      setError('End time must be in the future.');
      return;
    }

    setError(null);
    await onSubmit({
      name: trimmedName,
      endTime,
      options: parsedOptions,
    });
    setName('');
    setDeadline('');
    setOptions(['', '']);
  };

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <div className="form-control">
        <label htmlFor="election-name">Election Name</label>
        <input
          id="election-name"
          type="text"
          placeholder="Board election 2025"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={disabled || isSubmitting}
        />
      </div>

      <div className="form-control">
        <label htmlFor="deadline">Voting deadline</label>
        <input
          id="deadline"
          type="datetime-local"
          value={deadline}
          onChange={(event) => setDeadline(event.target.value)}
          disabled={disabled || isSubmitting}
        />
        <p className="muted-hint">All ballots close automatically when this timestamp is reached.</p>
      </div>

      <div className="form-control">
        <label>Options (2-8)</label>
        <div className="options-list">
          {options.map((value, index) => (
            <div className="option-row" key={`option-${index}`}>
              <input
                type="text"
                value={value}
                placeholder={`Option ${index + 1}`}
                onChange={(event) => handleOptionChange(index, event.target.value)}
                disabled={disabled || isSubmitting}
              />
              {options.length > 2 && (
                <button type="button" onClick={() => handleRemoveOption(index)} disabled={disabled || isSubmitting}>
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={handleAddOption}
          disabled={options.length >= 8 || disabled || isSubmitting}
        >
          + Add option
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <button className="primary-button" type="submit" disabled={disabled || isSubmitting}>
        {isSubmitting ? 'Creating election...' : 'Publish election'}
      </button>
    </form>
  );
}
