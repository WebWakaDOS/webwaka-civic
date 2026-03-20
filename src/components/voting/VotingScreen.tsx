/**
 * WebWaka Civic — Voting Screen Component
 * Offline-capable voting interface with confirmation and sync
 * Mobile-first PWA design
 */

import React, { useState, useEffect } from 'react';

interface Candidate {
  id: string;
  name: string;
  party: string;
  photo?: string;
  bio?: string;
}

interface VotingScreenProps {
  electionId: string;
  candidates: Candidate[];
  onVote: (candidateId: string) => Promise<void>;
  isOffline?: boolean;
  hasVoted?: boolean;
}

export const VotingScreen: React.FC<VotingScreenProps> = ({
  electionId,
  candidates,
  onVote,
  isOffline = false,
  hasVoted = false,
}) => {
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voteSubmitted, setVoteSubmitted] = useState(false);

  const handleCandidateSelect = (candidateId: string) => {
    if (hasVoted) return;
    setSelectedCandidate(candidateId);
    setShowConfirmation(true);
  };

  const handleConfirmVote = async () => {
    if (!selectedCandidate) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await onVote(selectedCandidate);
      setVoteSubmitted(true);
      setShowConfirmation(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit vote');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelVote = () => {
    setShowConfirmation(false);
    setSelectedCandidate(null);
  };

  if (voteSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-green-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center max-w-md">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Vote Submitted</h1>
          <p className="text-gray-600 mb-4">
            {isOffline
              ? 'Your vote has been saved offline and will be synced when you go online.'
              : 'Your vote has been successfully recorded.'}
          </p>
          <p className="text-sm text-gray-500">Thank you for voting!</p>
        </div>
      </div>
    );
  }

  if (hasVoted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center max-w-md">
          <div className="text-5xl mb-4">🗳️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Already Voted</h1>
          <p className="text-gray-600">You have already cast your vote in this election.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Cast Your Vote</h1>
        <p className="text-gray-600">Select your preferred candidate</p>
        {isOffline && (
          <div className="mt-2 inline-block bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium">
            📡 Offline Mode - Vote will sync when online
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 font-medium">Error: {error}</p>
        </div>
      )}

      {/* Candidates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {candidates.map((candidate) => (
          <div
            key={candidate.id}
            onClick={() => handleCandidateSelect(candidate.id)}
            className={`rounded-lg shadow cursor-pointer transition-all ${
              selectedCandidate === candidate.id
                ? 'ring-2 ring-blue-600 bg-blue-50'
                : 'bg-white hover:shadow-lg'
            }`}
          >
            {/* Candidate Photo */}
            {candidate.photo && (
              <div className="aspect-video bg-gray-200 overflow-hidden rounded-t-lg">
                <img
                  src={candidate.photo}
                  alt={candidate.name}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Candidate Info */}
            <div className="p-4">
              <h2 className="text-xl font-bold text-gray-900 mb-1">{candidate.name}</h2>
              <p className="text-sm text-blue-600 font-medium mb-3">{candidate.party}</p>

              {candidate.bio && (
                <p className="text-sm text-gray-600 mb-4 line-clamp-2">{candidate.bio}</p>
              )}

              {/* Selection Indicator */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Click to select</span>
                {selectedCandidate === candidate.id && (
                  <span className="text-lg">✓</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Confirmation Modal */}
      {showConfirmation && selectedCandidate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Confirm Your Vote</h2>

            {/* Selected Candidate */}
            <div className="bg-blue-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-600 mb-2">You selected:</p>
              <p className="text-xl font-bold text-gray-900">
                {candidates.find((c) => c.id === selectedCandidate)?.name}
              </p>
              <p className="text-sm text-blue-600 font-medium">
                {candidates.find((c) => c.id === selectedCandidate)?.party}
              </p>
            </div>

            {/* Warning */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-yellow-800">
                ⚠️ You can only vote once. Please confirm your selection carefully.
              </p>
            </div>

            {/* Offline Notice */}
            {isOffline && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-800">
                  📡 You are offline. Your vote will be saved locally and synced when you reconnect.
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleCancelVote}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmVote}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg disabled:opacity-50"
              >
                {isSubmitting ? 'Submitting...' : 'Confirm Vote'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info Footer */}
      <div className="mt-8 bg-blue-50 rounded-lg p-4 text-center">
        <p className="text-sm text-blue-800">
          <strong>Privacy Notice:</strong> Your vote is secret and secure. No one can see who you voted for.
        </p>
      </div>
    </div>
  );
};

export default VotingScreen;
