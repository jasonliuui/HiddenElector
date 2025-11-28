import { useMemo, useState } from 'react';
import { WagmiProvider, useAccount, usePublicClient } from 'wagmi';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { Contract } from 'ethers';
import '@rainbow-me/rainbowkit/styles.css';

import { config } from './config/wagmi';
import { hiddenElectorAbi, hiddenElectorAddress } from './config/contracts';
import { Header } from './components/Header';
import { useEthersSigner } from './hooks/useEthersSigner';
import { useZamaInstance } from './hooks/useZamaInstance';
import { CreateElectionForm } from './components/CreateElectionForm';
import type { CreateElectionPayload } from './components/CreateElectionForm';
import { ElectionCard } from './components/ElectionCard';
import './styles/ElectionApp.css';

const queryClient = new QueryClient();

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

function ElectionApp() {
  const { address } = useAccount();
  const signer = useEthersSigner();
  const publicClient = usePublicClient();
  const { instance: zamaInstance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [creating, setCreating] = useState(false);
  const [votingId, setVotingId] = useState<number | null>(null);
  const [finalizingId, setFinalizingId] = useState<number | null>(null);
  const [decryptingId, setDecryptingId] = useState<number | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [txNotice, setTxNotice] = useState<string | null>(null);
  const [decryptedResults, setDecryptedResults] = useState<Record<number, Record<number, number>>>({});

  const hasValidAddress = useMemo(
    () => /^0x[a-fA-F0-9]{40}$/.test(hiddenElectorAddress) ,
    [],
  );

  const { data: elections = [], isFetching, refetch } = useQuery<Election[]>({
    queryKey: ['hidden-elector-elections', publicClient?.chain?.id, address, hasValidAddress],
    enabled: Boolean(publicClient) && hasValidAddress,
    staleTime: 15_000,
    queryFn: async () => {
      if (!publicClient) {
        return [];
      }
      const count = (await publicClient.readContract({
        address: hiddenElectorAddress,
        abi: hiddenElectorAbi,
        functionName: 'getElectionCount',
      })) as bigint;
      const items: Election[] = [];
      for (let i = 0n; i < count; i++) {
        const rawElection = (await publicClient.readContract({
          address: hiddenElectorAddress,
          abi: hiddenElectorAbi,
          functionName: 'getElection',
          args: [i],
        })) as unknown as {
          name: string;
          endTime: bigint;
          finalized: boolean;
          creator: string;
          optionCount: number;
          options: string[];
        };

        const voterStatus =
          address && address.length > 0
            ? ((await publicClient.readContract({
                address: hiddenElectorAddress,
                abi: hiddenElectorAbi,
                functionName: 'hasAddressVoted',
                args: [i, address],
              })) as boolean)
            : false;

        items.push({
          id: Number(i),
          name: rawElection.name,
          endTime: Number(rawElection.endTime),
          finalized: rawElection.finalized,
          creator: rawElection.creator,
          optionCount: rawElection.optionCount,
          options: rawElection.options,
          hasUserVoted: voterStatus,
        });
      }
      return items;
    },
  });

  const contractReady = Boolean(signer) && hasValidAddress;
  const zamaReady = Boolean(zamaInstance) && !zamaLoading && !zamaError;

  const refreshData = async () => {
    await refetch();
  };

  const handleCreateElection = async (payload: CreateElectionPayload) => {
    if (!contractReady) {
      setTxError('Connect your wallet and ensure contract address is configured.');
      return;
    }
    setTxError(null);
    setTxNotice(null);
    setCreating(true);
    try {
      const signerInstance = await signer!;
      const contract = new Contract(hiddenElectorAddress, hiddenElectorAbi, signerInstance);
      const timestamp = BigInt(Math.floor(payload.endTime / 1000));
      const tx = await contract.createElection(payload.name, payload.options, timestamp);
      setTxNotice('Creating election on-chain...');
      await tx.wait();
      setTxNotice('Election created successfully.');
      await refreshData();
    } catch (error) {
      setTxError((error as Error).message ?? 'Failed to create election');
    } finally {
      setCreating(false);
    }
  };

  const handleVote = async (electionId: number, optionIndex: number) => {
    if (!contractReady || !address) {
      setTxError('Connect a wallet before voting.');
      return;
    }
    if (!zamaReady || !zamaInstance) {
      setTxError('Encryption service is not ready yet.');
      return;
    }
    setTxError(null);
    setTxNotice(null);
    setVotingId(electionId);
    try {
      const buffer = zamaInstance.createEncryptedInput(hiddenElectorAddress, address);
      buffer.add32(BigInt(optionIndex));
      const encrypted = await buffer.encrypt();
      const signerInstance = await signer!;
      const contract = new Contract(hiddenElectorAddress, hiddenElectorAbi, signerInstance);
      const tx = await contract.vote(electionId, encrypted.handles[0], encrypted.inputProof);
      setTxNotice('Submitting vote...');
      await tx.wait();
      setTxNotice('Vote confirmed on-chain.');
      await refreshData();
    } catch (error) {
      setTxError((error as Error).message ?? 'Failed to cast vote');
    } finally {
      setVotingId(null);
    }
  };

  const handleFinalize = async (electionId: number) => {
    if (!contractReady) {
      setTxError('Connect your wallet to finalize elections.');
      return;
    }
    setTxError(null);
    setTxNotice(null);
    setFinalizingId(electionId);
    try {
      const signerInstance = await signer!;
      const contract = new Contract(hiddenElectorAddress, hiddenElectorAbi, signerInstance);
      const tx = await contract.finalizeElection(electionId);
      setTxNotice('Finalizing election...');
      await tx.wait();
      setTxNotice('Election finalized, tallies are now public.');
      await refreshData();
    } catch (error) {
      setTxError((error as Error).message ?? 'Failed to finalize election');
    } finally {
      setFinalizingId(null);
    }
  };

  const handleDecrypt = async (election: Election) => {
    if (!zamaReady || !zamaInstance || !publicClient) {
      setTxError('Encryption service is not ready.');
      return;
    }
    setTxError(null);
    setTxNotice(null);
    setDecryptingId(election.id);
    try {
      const handles = await Promise.all(
        election.options.map((_, optionIndex) =>
          publicClient.readContract({
            address: hiddenElectorAddress,
            abi: hiddenElectorAbi,
            functionName: 'getEncryptedTally',
            args: [BigInt(election.id), optionIndex],
          }),
        ),
      );
      const response = await zamaInstance.publicDecrypt(handles as string[]);
      const clearValues = response.clearValues as Record<string, bigint | number | string | boolean>;
      const mapped: Record<number, number> = {};
      handles.forEach((handle, index) => {
        const raw = clearValues[handle as string];
        if (typeof raw === 'bigint') {
          mapped[index] = Number(raw);
        } else if (typeof raw === 'number') {
          mapped[index] = raw;
        } else if (typeof raw === 'string') {
          mapped[index] = Number(raw);
        } else {
          mapped[index] = 0;
        }
      });

      setDecryptedResults((prev) => ({
        ...prev,
        [election.id]: mapped,
      }));
      setTxNotice('Tallies decrypted locally.');
    } catch (error) {
      setTxError((error as Error).message ?? 'Failed to decrypt tallies');
    } finally {
      setDecryptingId(null);
    }
  };

  return (
    <div className="app-shell">
      <Header />
      <main className="content-wrapper">
        <section className="grid-panels">
          <div className="panel">
            <h2 className="panel-title">Start a new election</h2>
            <p className="panel-subtitle">Define the ballot name, closing time and 2-8 encrypted options.</p>
            <CreateElectionForm onSubmit={handleCreateElection} isSubmitting={creating} disabled={!contractReady} />
          </div>
          <div className="panel">
            <h2 className="panel-title">Network status</h2>
            <p className="panel-subtitle">
              Contract address: <strong>{hiddenElectorAddress}</strong>
            </p>
            <div className="encryption-banner">
              {zamaLoading && <span>Preparing the Zama relayer...</span>}
              {zamaError && <span className="error-text">Encryption service error: {zamaError}</span>}
              {zamaReady && !zamaError && <span>Encryption service ready for voting and public decryption.</span>}
            </div>
            {!hasValidAddress && (
              <p className="error-text" style={{ marginTop: '12px' }}>
                Update <code>hiddenElectorAddress</code> with your deployed Sepolia contract before interacting.
              </p>
            )}
            {txError && (
              <p className="error-text" style={{ marginTop: '14px' }}>
                {txError}
              </p>
            )}
            {txNotice && <p className="muted-hint">{txNotice}</p>}
          </div>
        </section>

        <section className="elections-wrapper">
          {!hasValidAddress && (
            <div className="empty-state">
              <p>Waiting for a deployed HiddenElector address.</p>
              <p className="muted-hint">Deploy the contract on Sepolia and update the address to get started.</p>
            </div>
          )}

          {hasValidAddress && isFetching && (
            <div className="empty-state">
              <p>Fetching election data from the chain...</p>
            </div>
          )}

          {hasValidAddress && !isFetching && elections.length === 0 && (
            <div className="empty-state">
              <p>No elections yet</p>
              <p className="muted-hint">Use the form above to publish the first encrypted ballot.</p>
            </div>
          )}

          {elections.map((election) => (
            <ElectionCard
              key={election.id}
              election={election}
              onVote={handleVote}
              onFinalize={handleFinalize}
              onDecrypt={handleDecrypt}
              decryptedResults={decryptedResults[election.id]}
              voting={votingId === election.id}
              finalizing={finalizingId === election.id}
              decrypting={decryptingId === election.id}
              walletConnected={Boolean(address)}
              contractReady={contractReady}
              zamaReady={zamaReady}
            />
          ))}
        </section>
      </main>
    </div>
  );
}

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider locale="en">
          <ElectionApp />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
