/**
 * WebWaka Civic — Elections Dashboard Component
 * Displays elections list, status, and quick actions
 * Mobile-first, PWA-ready, offline-capable
 */

import React, { useState, useEffect } from 'react';

interface Election {
  id: string;
  name: string;
  status: 'upcoming' | 'nomination' | 'voting' | 'closed';
  startDate: number;
  endDate: number;
  candidateCount: number;
  voterCount: number;
}

interface ElectionsDashboardProps {
  elections: Election[];
  onSelectElection: (id: string) => void;
  isLoading: boolean;
  isOffline?: boolean;
}

export const ElectionsDashboard: React.FC<ElectionsDashboardProps> = ({
  elections,
  onSelectElection,
  isLoading,
  isOffline = false,
}) => {
  const [filteredElections, setFilteredElections] = useState<Election[]>(elections);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    let filtered = elections;

    if (statusFilter !== 'all') {
      filtered = filtered.filter((e) => e.status === statusFilter);
    }

    if (searchQuery) {
      filtered = filtered.filter((e) =>
        e.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredElections(filtered);
  }, [elections, statusFilter, searchQuery]);

  const getStatusBadgeColor = (status: string): string => {
    switch (status) {
      case 'upcoming':
        return 'bg-blue-100 text-blue-800';
      case 'nomination':
        return 'bg-yellow-100 text-yellow-800';
      case 'voting':
        return 'bg-green-100 text-green-800';
      case 'closed':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading elections...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Elections</h1>
        {isOffline && (
          <div className="inline-block bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium">
            📡 Offline Mode
          </div>
        )}
      </div>

      {/* Search & Filter */}
      <div className="mb-6 space-y-4">
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search elections..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="absolute right-3 top-2.5 text-gray-400">🔍</span>
        </div>

        {/* Status Filter */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {['all', 'upcoming', 'nomination', 'voting', 'closed'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
                statusFilter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Elections Grid */}
      {filteredElections.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">No elections found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredElections.map((election) => (
            <div
              key={election.id}
              onClick={() => onSelectElection(election.id)}
              className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer overflow-hidden"
            >
              {/* Card Header */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-4">
                <h2 className="text-xl font-bold text-white mb-2">{election.name}</h2>
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusBadgeColor(election.status)}`}>
                  {election.status.charAt(0).toUpperCase() + election.status.slice(1)}
                </span>
              </div>

              {/* Card Body */}
              <div className="px-4 py-4 space-y-3">
                {/* Dates */}
                <div className="text-sm text-gray-600">
                  <p className="font-medium text-gray-900">📅 {formatDate(election.startDate)}</p>
                  <p className="text-xs">to {formatDate(election.endDate)}</p>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-200">
                  <div>
                    <p className="text-xs text-gray-500">Candidates</p>
                    <p className="text-lg font-bold text-gray-900">{election.candidateCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Voters</p>
                    <p className="text-lg font-bold text-gray-900">{election.voterCount}</p>
                  </div>
                </div>

                {/* Action Button */}
                <button className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors">
                  View Details →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer Info */}
      <div className="mt-8 text-center text-sm text-gray-500">
        <p>Showing {filteredElections.length} of {elections.length} elections</p>
      </div>
    </div>
  );
};

export default ElectionsDashboard;
