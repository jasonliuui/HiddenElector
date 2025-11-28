import { useMemo, useState } from 'react';

type Election = {
  id: number;
  name: string;
  endTime: number;
  finalized: boolean;
  creator: string;
  optionCount: number;
  options: string[];
  hasUserVoted: boolean;
};

type Props = {
  election: Election;
  onVote: (electionId: number, optionIndex: number) => Promise<void>;
  onFinalize: (electionId: number) => Promise<void>;
  onDecrypt: (election: Election) => Promise<void>;
  decryptedResults?: Record<number, number>;
  voting: boolean;
  finalizing: boolean;
  decrypting: boolean;
  walletConnected: boolean;
  contractReady: boolean;
  zamaReady: boolean;
};

export function ElectionCard({
  election,
  onVote,
  onFinalize,
  onDecrypt,
  decryptedResults,
  voting,
  finalizing,
  decrypting,
  walletConnected,
  contractReady,
  zamaReady,
}: Props) {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  const now = Math.floor(Date.now() / 1000);
  const votingOpen = !election.finalized && now < election.endTime;
  const needsFinalization = !election.finalized && now >= election.endTime;

  const statusLabel = votingOpen ? 'Active' : needsFinalization ? 'Awaiting finalization' : 'Public Result';
  const statusClass = votingOpen ? 'status-pill status-active' : needsFinalization ? 'status-pill status-waiting' : 'status-pill status-final';

  const closingTime = useMemo(() => new Date(election.endTime * 1000).toLocaleString(), [election.endTime]);

  const canVote = votingOpen && walletConnected && contractReady && zamaReady && !election.hasUserVoted;
  const canFinalize = needsFinalization && contractReady;
  const canDecrypt = election.finalized && zamaReady;

  const handleVoteClick = async () => {
    if (selectedOption === null) {
      return;
    }
    await onVote(election.id, selectedOption);
    setSelectedOption(null);
  };

  return (
    <article className="election-card">
      <div className="card-header">
        <div>
          <h3 style={{ margin: 0 }}>{election.name}</h3>
          <p className="muted-hint">Voting closes on {closingTime}</p>
        </div>
        <span className={statusClass}>{statusLabel}</span>
      </div>

      <div className="options-grid">
        {election.options.map((option, index) => {
          const result = decryptedResults?.[index];
          let helper = 'Encrypted until the election is finalized.';
          if (election.finalized) {
            helper = result !== undefined ? `${result} votes` : 'Public tally available - decrypt to reveal.';
          } else if (needsFinalization) {
            helper = 'Awaiting finalization to reveal tallies.';
          }
          return (
            <div className="option-line" key={`${election.id}-option-${index}`}>
              <strong>{option}</strong>
              <span className="muted-hint">{helper}</span>
            </div>
          );
        })}
      </div>

      {canVote && (
        <div>
          <div className="radio-list">
            {election.options.map((option, index) => (
              <label className="radio-item" key={`vote-${election.id}-${index}`}>
                <input
                  type="radio"
                  name={`vote-${election.id}`}
                  checked={selectedOption === index}
                  onChange={() => setSelectedOption(index)}
                  disabled={voting}
                />
                {option}
              </label>
            ))}
          </div>
          <button className="primary-button" onClick={handleVoteClick} disabled={selectedOption === null || voting}>
            {voting ? 'Submitting vote...' : 'Submit encrypted vote'}
          </button>
        </div>
      )}

      {!votingOpen && election.hasUserVoted && (
        <p className="muted-hint" style={{ marginTop: '12px' }}>
          You have already voted in this election.
        </p>
      )}

      <div className="vote-actions">
        {needsFinalization && (
          <button className="secondary-button" onClick={() => onFinalize(election.id)} disabled={!canFinalize || finalizing}>
            {finalizing ? 'Finalizing...' : 'Finalize election'}
          </button>
        )}
        {election.finalized && (
          <button className="secondary-button" onClick={() => onDecrypt(election)} disabled={!canDecrypt || decrypting}>
            {decrypting ? 'Decrypting...' : 'Decrypt results'}
          </button>
        )}
      </div>
    </article>
  );
}
