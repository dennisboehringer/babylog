import { useState } from 'react';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { useApp } from '../context/AppContext';
import { useSync } from '../context/SyncContext';
import type { BabyProfile } from '../types';

const PRESET_COLORS = [
  '#388BFD', '#2EA043', '#D29922', '#DA3633',
  '#A371F7', '#F778BA', '#56D4DD', '#E09B54',
];

export default function Onboarding() {
  const { dispatch } = useApp();
  const { joinRoom } = useSync();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [dob, setDob] = useState(new Date().toISOString().split('T')[0]);
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [unit, setUnit] = useState<'oz' | 'mL'>('oz');

  // Join flow state
  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  async function handleFinish() {
    const baby: BabyProfile = {
      id: uuid(),
      name: name.trim() || 'Baby',
      dob,
      gender,
      themeColor: color,
      unitPreference: unit,
      reminderIntervalMinutes: 180,
      createdAt: Date.now(),
    };
    await db.babies.add(baby);
    dispatch({ type: 'ADD_BABY', baby });
  }

  async function handleJoinRoom() {
    if (joinCode.length !== 6) return;
    setJoining(true);
    setJoinError('');

    const success = await joinRoom(joinCode);
    if (!success) {
      setJoinError('Room not found. Check the code and try again.');
      setJoining(false);
    }
    // If success, AppContext will have babies and App.tsx will show main screen
  }

  // Join Partner screen
  if (showJoin) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6">
        <div className="w-full max-w-sm">
          <button
            onClick={() => { setShowJoin(false); setJoinError(''); }}
            className="text-text-secondary text-sm mb-8 flex items-center gap-1"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>

          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-accent-blue/15 flex items-center justify-center mx-auto mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#388BFD" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87" />
                <path d="M16 3.13a4 4 0 010 7.75" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2">Join Partner's Room</h2>
            <p className="text-text-secondary text-sm">
              Enter the 6-digit code from your partner's phone to sync all data.
            </p>
          </div>

          <input
            type="text"
            inputMode="numeric"
            value={joinCode}
            onChange={e => {
              setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6));
              setJoinError('');
            }}
            placeholder="000000"
            maxLength={6}
            autoFocus
            className="w-full px-4 py-4 rounded-2xl bg-bg-input text-text-primary text-2xl text-center tracking-[0.5em] font-bold outline-none focus:ring-2 focus:ring-accent-blue mb-4"
          />

          {joinError && (
            <div className="bg-accent-red/10 border border-accent-red/20 rounded-xl p-3 mb-4">
              <p className="text-sm text-accent-red text-center">{joinError}</p>
            </div>
          )}

          <button
            onClick={handleJoinRoom}
            disabled={joinCode.length !== 6 || joining}
            className="w-full py-4 rounded-2xl bg-accent-blue text-white font-semibold text-lg disabled:opacity-40 active:opacity-80 flex items-center justify-center gap-2"
          >
            {joining ? (
              <>
                <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Connecting...
              </>
            ) : (
              'Join Room'
            )}
          </button>
        </div>
      </div>
    );
  }

  // Welcome screen
  if (step === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6">
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-accent-blue/20 to-accent-blue/5 flex items-center justify-center mb-6">
            <span className="text-4xl">👶</span>
          </div>
          <h1 className="text-2xl font-bold mb-2">Welcome to BabyLog</h1>
          <p className="text-text-secondary text-center mb-2 max-w-xs">
            Track feeds, diapers, and pumping — built for tired parents.
          </p>
        </div>

        <div className="w-full pb-8 space-y-3">
          <button
            onClick={() => setStep(1)}
            className="w-full py-4 rounded-2xl bg-accent-blue text-white font-semibold text-lg active:opacity-80"
          >
            Get Started
          </button>
          <button
            onClick={() => setShowJoin(true)}
            className="w-full py-4 rounded-2xl bg-bg-card text-text-primary font-medium text-base active:opacity-80 border border-border"
          >
            Join Partner's Room
          </button>
        </div>
      </div>
    );
  }

  // Baby details
  if (step === 1) {
    return (
      <div className="flex flex-col h-full px-6 pt-12">
        <h2 className="text-xl font-semibold mb-6">About your baby</h2>

        <label className="text-text-secondary text-sm mb-1">Baby's name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Enter name"
          autoFocus
          className="w-full px-4 py-3 rounded-xl bg-bg-input text-text-primary text-lg mb-4 outline-none focus:ring-2 focus:ring-accent-blue"
        />

        <label className="text-text-secondary text-sm mb-1">Date of birth</label>
        <input
          type="date"
          value={dob}
          onChange={e => setDob(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-bg-input text-text-primary text-lg mb-4 outline-none focus:ring-2 focus:ring-accent-blue"
        />

        <label className="text-text-secondary text-sm mb-2">Gender</label>
        <div className="flex gap-2 mb-6">
          {(['male', 'female', 'other'] as const).map(g => (
            <button
              key={g}
              onClick={() => setGender(g)}
              className={`flex-1 py-3 rounded-xl text-base font-medium capitalize ${
                gender === g
                  ? 'bg-accent-blue text-white'
                  : 'bg-bg-card text-text-secondary'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        <button
          onClick={() => setStep(2)}
          disabled={!name.trim()}
          className="w-full py-4 rounded-2xl bg-accent-blue text-white font-semibold text-lg mt-auto mb-8 disabled:opacity-40 active:opacity-80"
        >
          Next
        </button>
      </div>
    );
  }

  // Preferences
  return (
    <div className="flex flex-col h-full px-6 pt-12">
      <h2 className="text-xl font-semibold mb-6">Preferences</h2>

      <label className="text-text-secondary text-sm mb-2">Theme color</label>
      <div className="flex gap-3 mb-6 flex-wrap">
        {PRESET_COLORS.map(c => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className="w-10 h-10 rounded-full border-2 transition-transform"
            style={{
              backgroundColor: c,
              borderColor: color === c ? '#E1E4E8' : 'transparent',
              transform: color === c ? 'scale(1.15)' : 'scale(1)',
            }}
          />
        ))}
      </div>

      <label className="text-text-secondary text-sm mb-2">Unit preference</label>
      <div className="flex gap-2 mb-6">
        {(['oz', 'mL'] as const).map(u => (
          <button
            key={u}
            onClick={() => setUnit(u)}
            className={`flex-1 py-3 rounded-xl text-base font-medium ${
              unit === u
                ? 'bg-accent-blue text-white'
                : 'bg-bg-card text-text-secondary'
            }`}
          >
            {u}
          </button>
        ))}
      </div>

      <button
        onClick={handleFinish}
        className="w-full py-4 rounded-2xl bg-accent-blue text-white font-semibold text-lg mt-auto mb-8 active:opacity-80"
      >
        Start Tracking
      </button>
    </div>
  );
}
