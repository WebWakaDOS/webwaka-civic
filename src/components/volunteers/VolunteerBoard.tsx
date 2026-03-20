/**
 * WebWaka Civic — Volunteer Board Component
 * Task management, leaderboard, and gamification
 * Mobile-first PWA design
 */

import React, { useState, useEffect } from 'react';

interface Task {
  id: string;
  title: string;
  description: string;
  points: number;
  status: 'available' | 'assigned' | 'completed';
  category: string;
}

interface Volunteer {
  id: string;
  name: string;
  points: number;
  rank: number;
  badge?: string;
  tasksCompleted: number;
  streak?: number;
}

interface VolunteerBoardProps {
  volunteerId: string;
  tasks: Task[];
  leaderboard: Volunteer[];
  onTaskComplete: (taskId: string) => Promise<void>;
  isOffline?: boolean;
}

export const VolunteerBoard: React.FC<VolunteerBoardProps> = ({
  volunteerId,
  tasks,
  leaderboard,
  onTaskComplete,
  isOffline = false,
}) => {
  const [activeTab, setActiveTab] = useState<'tasks' | 'leaderboard'>('tasks');
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [completingTask, setCompletingTask] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentVolunteer = leaderboard.find((v) => v.id === volunteerId);
  const availableTasks = tasks.filter((t) => t.status === 'available');
  const assignedTasks = tasks.filter((t) => t.status === 'assigned');
  const completedTasks = tasks.filter((t) => t.status === 'completed');

  const handleCompleteTask = async (taskId: string) => {
    setCompletingTask(true);
    setError(null);

    try {
      await onTaskComplete(taskId);
      setSelectedTask(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete task');
    } finally {
      setCompletingTask(false);
    }
  };

  const getBadgeEmoji = (badge?: string): string => {
    const badges: { [key: string]: string } = {
      'top-fundraiser': '💰',
      'volunteer-star': '⭐',
      'organizer': '📋',
      'champion': '🏆',
      'rising-star': '🌟',
    };
    return badges[badge || ''] || '';
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Volunteer Hub</h1>
        {isOffline && (
          <div className="inline-block bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium">
            📡 Offline Mode
          </div>
        )}
      </div>

      {/* Current Volunteer Stats */}
      {currentVolunteer && (
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow-lg p-6 mb-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90">Your Stats</p>
              <h2 className="text-2xl font-bold mb-2">{currentVolunteer.name}</h2>
              <div className="flex gap-6">
                <div>
                  <p className="text-sm opacity-90">Points</p>
                  <p className="text-2xl font-bold">{currentVolunteer.points}</p>
                </div>
                <div>
                  <p className="text-sm opacity-90">Tasks Done</p>
                  <p className="text-2xl font-bold">{currentVolunteer.tasksCompleted}</p>
                </div>
                {currentVolunteer.streak && (
                  <div>
                    <p className="text-sm opacity-90">Streak</p>
                    <p className="text-2xl font-bold">🔥 {currentVolunteer.streak}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm opacity-90">Rank</p>
              <p className="text-4xl font-bold">#{currentVolunteer.rank}</p>
              {currentVolunteer.badge && (
                <p className="text-3xl mt-2">{getBadgeEmoji(currentVolunteer.badge)}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`px-4 py-3 font-medium border-b-2 transition-colors ${
            activeTab === 'tasks'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          📋 Tasks ({availableTasks.length + assignedTasks.length})
        </button>
        <button
          onClick={() => setActiveTab('leaderboard')}
          className={`px-4 py-3 font-medium border-b-2 transition-colors ${
            activeTab === 'leaderboard'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          🏆 Leaderboard
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 font-medium">Error: {error}</p>
        </div>
      )}

      {/* Tasks Tab */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          {/* Available Tasks */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-3">Available Tasks</h3>
            {availableTasks.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No available tasks</p>
            ) : (
              <div className="space-y-3">
                {availableTasks.map((task) => (
                  <div
                    key={task.id}
                    className="bg-white rounded-lg shadow p-4 hover:shadow-lg transition-shadow cursor-pointer"
                    onClick={() => setSelectedTask(task.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-gray-900 mb-1">{task.title}</h4>
                        <p className="text-sm text-gray-600 mb-2">{task.description}</p>
                        <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                          {task.category}
                        </span>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-green-600">+{task.points}</p>
                        <p className="text-xs text-gray-500">points</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Assigned Tasks */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-3">My Tasks</h3>
            {assignedTasks.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No assigned tasks</p>
            ) : (
              <div className="space-y-3">
                {assignedTasks.map((task) => (
                  <div
                    key={task.id}
                    className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-bold text-gray-900 mb-1">{task.title}</h4>
                        <p className="text-sm text-gray-600">{task.description}</p>
                      </div>
                      <p className="text-xl font-bold text-green-600">+{task.points}</p>
                    </div>
                    <button
                      onClick={() => handleCompleteTask(task.id)}
                      disabled={completingTask}
                      className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {completingTask ? 'Completing...' : '✓ Mark as Complete'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Completed Tasks */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-3">Completed ({completedTasks.length})</h3>
            {completedTasks.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No completed tasks yet</p>
            ) : (
              <div className="space-y-2">
                {completedTasks.slice(0, 3).map((task) => (
                  <div key={task.id} className="bg-green-50 rounded-lg p-3 flex items-center justify-between">
                    <span className="text-gray-700">✓ {task.title}</span>
                    <span className="text-green-600 font-bold">+{task.points}</span>
                  </div>
                ))}
                {completedTasks.length > 3 && (
                  <p className="text-sm text-gray-500 text-center pt-2">
                    +{completedTasks.length - 3} more completed
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Leaderboard Tab */}
      {activeTab === 'leaderboard' && (
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-4">Top Volunteers</h3>
          <div className="space-y-2">
            {leaderboard.slice(0, 10).map((volunteer, index) => (
              <div
                key={volunteer.id}
                className={`flex items-center justify-between p-4 rounded-lg ${
                  volunteer.id === volunteerId
                    ? 'bg-blue-50 border-2 border-blue-600'
                    : 'bg-white border border-gray-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-gray-400 w-8">#{index + 1}</span>
                  <div>
                    <p className="font-bold text-gray-900">{volunteer.name}</p>
                    <p className="text-xs text-gray-500">{volunteer.tasksCompleted} tasks</p>
                  </div>
                </div>
                <div className="text-right">
                  {volunteer.badge && <p className="text-xl mb-1">{getBadgeEmoji(volunteer.badge)}</p>}
                  <p className="font-bold text-gray-900">{volunteer.points} pts</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default VolunteerBoard;
