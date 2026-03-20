/**
 * WebWaka Civic — Fundraising Dashboard Component
 * Campaign budget tracking, donations, and expense management
 * Mobile-first PWA design
 */

import React, { useState } from 'react';

interface Budget {
  totalBudget: number;
  raisedFunds: number;
  spentBudget: number;
  remainingBudget: number;
  spendPercentage: number;
  fundraisingPercentage: number;
}

interface Donation {
  id: string;
  donorName: string;
  amount: number;
  status: 'pending' | 'completed' | 'refunded';
  createdAt: number;
}

interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  status: 'pending' | 'approved' | 'paid';
  createdAt: number;
}

interface FundraisingDashboardProps {
  campaignId: string;
  budget: Budget;
  donations: Donation[];
  expenses: Expense[];
  onDonate?: () => void;
  onSubmitExpense?: () => void;
  isOffline?: boolean;
}

export const FundraisingDashboard: React.FC<FundraisingDashboardProps> = ({
  campaignId,
  budget,
  donations,
  expenses,
  onDonate,
  onSubmitExpense,
  isOffline = false,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'donations' | 'expenses'>('overview');

  const formatCurrency = (amount: number): string => {
    return (amount / 100).toLocaleString('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    });
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getDonationStatusColor = (status: string): string => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'refunded':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getExpenseStatusColor = (status: string): string => {
    switch (status) {
      case 'pending':
        return 'bg-blue-100 text-blue-800';
      case 'approved':
        return 'bg-yellow-100 text-yellow-800';
      case 'paid':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const completedDonations = donations.filter((d) => d.status === 'completed');
  const approvedExpenses = expenses.filter((e) => e.status === 'approved' || e.status === 'paid');

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Campaign Fundraising</h1>
        {isOffline && (
          <div className="inline-block bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium">
            📡 Offline Mode
          </div>
        )}
      </div>

      {/* Budget Progress */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Budget Status</h2>

        {/* Progress Bars */}
        <div className="space-y-6">
          {/* Fundraising Progress */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Fundraising Goal</label>
              <span className="text-sm font-bold text-gray-900">
                {budget.fundraisingPercentage}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className="bg-green-600 h-3 rounded-full transition-all"
                style={{ width: `${Math.min(budget.fundraisingPercentage, 100)}%` }}
              ></div>
            </div>
            <div className="flex items-center justify-between mt-2 text-sm text-gray-600">
              <span>{formatCurrency(budget.raisedFunds)}</span>
              <span>{formatCurrency(budget.totalBudget)}</span>
            </div>
          </div>

          {/* Spending Progress */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Budget Spent</label>
              <span className="text-sm font-bold text-gray-900">
                {budget.spendPercentage}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all ${
                  budget.spendPercentage > 80 ? 'bg-red-600' : 'bg-blue-600'
                }`}
                style={{ width: `${Math.min(budget.spendPercentage, 100)}%` }}
              ></div>
            </div>
            <div className="flex items-center justify-between mt-2 text-sm text-gray-600">
              <span>{formatCurrency(budget.spentBudget)}</span>
              <span>{formatCurrency(budget.totalBudget)}</span>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-200">
          <div>
            <p className="text-xs text-gray-500 mb-1">Total Budget</p>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(budget.totalBudget)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Raised</p>
            <p className="text-lg font-bold text-green-600">{formatCurrency(budget.raisedFunds)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Spent</p>
            <p className="text-lg font-bold text-blue-600">{formatCurrency(budget.spentBudget)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Remaining</p>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(budget.remainingBudget)}</p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <button
          onClick={onDonate}
          className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition-colors"
        >
          💰 Make Donation
        </button>
        <button
          onClick={onSubmitExpense}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors"
        >
          📝 Submit Expense
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-3 font-medium border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          📊 Overview
        </button>
        <button
          onClick={() => setActiveTab('donations')}
          className={`px-4 py-3 font-medium border-b-2 transition-colors ${
            activeTab === 'donations'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          💳 Donations ({completedDonations.length})
        </button>
        <button
          onClick={() => setActiveTab('expenses')}
          className={`px-4 py-3 font-medium border-b-2 transition-colors ${
            activeTab === 'expenses'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          📋 Expenses ({approvedExpenses.length})
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Recent Donations */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Donations</h3>
            {completedDonations.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No donations yet</p>
            ) : (
              <div className="space-y-3">
                {completedDonations.slice(0, 5).map((donation) => (
                  <div key={donation.id} className="flex items-center justify-between py-2 border-b border-gray-200">
                    <div>
                      <p className="font-medium text-gray-900">{donation.donorName}</p>
                      <p className="text-xs text-gray-500">{formatDate(donation.createdAt)}</p>
                    </div>
                    <p className="font-bold text-green-600">{formatCurrency(donation.amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Expenses */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Expenses</h3>
            {approvedExpenses.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No expenses yet</p>
            ) : (
              <div className="space-y-3">
                {approvedExpenses.slice(0, 5).map((expense) => (
                  <div key={expense.id} className="flex items-center justify-between py-2 border-b border-gray-200">
                    <div>
                      <p className="font-medium text-gray-900">{expense.description}</p>
                      <p className="text-xs text-gray-500">{expense.category}</p>
                    </div>
                    <p className="font-bold text-blue-600">{formatCurrency(expense.amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Donations Tab */}
      {activeTab === 'donations' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">All Donations</h3>
          {donations.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No donations yet</p>
          ) : (
            <div className="space-y-3">
              {donations.map((donation) => (
                <div key={donation.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{donation.donorName}</p>
                    <p className="text-sm text-gray-600">{formatDate(donation.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{formatCurrency(donation.amount)}</p>
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getDonationStatusColor(donation.status)}`}>
                      {donation.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Expenses Tab */}
      {activeTab === 'expenses' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">All Expenses</h3>
          {expenses.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No expenses yet</p>
          ) : (
            <div className="space-y-3">
              {expenses.map((expense) => (
                <div key={expense.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{expense.description}</p>
                    <p className="text-sm text-gray-600">{expense.category} • {formatDate(expense.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{formatCurrency(expense.amount)}</p>
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getExpenseStatusColor(expense.status)}`}>
                      {expense.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FundraisingDashboard;
