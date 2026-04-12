import { useState } from 'react';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { useApp } from '../context/AppContext';
import type { BabyProfile } from '../types';

const PRESET_COLORS = [
  '#388BFD', '#2EA043', '#D29922', '#DA3633',
  '#A371F7', '#F778BA', '#56D4DD', '#E09B54',
];

export default function Onboarding() {
  const { dispatch } = useApp();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [dob, setDob] = useState(new Date().toISOString().split('T')[0]);
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [unit, setUnit] = useState<'oz' | 'mL'>('oz');

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

  if (step === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6">
        <div className="text-5xl mb-4">👶</div>
        <h1 className="text-2xl font-semibold mb-2">Welcome to BabyLog</h1>
        <p className="text-text-secondary text-center mb-8">
          Track feeds, diapers, and pumping — built for tired parents.
        </p>
        <button
          onClick={() => setStep(1)}
          className="w-full py-4 rounded-2xl bg-accent-blue text-text-primary font-semibold text-lg active:opacity-80"
        >
          Get Started
        </button>
      </div>
    );
  }

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
                  ? 'bg-accent-blue text-text-primary'
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
          className="w-full py-4 rounded-2xl bg-accent-blue text-text-primary font-semibold text-lg mt-auto mb-8 disabled:opacity-40 active:opacity-80"
        >
          Next
        </button>
      </div>
    );
  }

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
                ? 'bg-accent-blue text-text-primary'
                : 'bg-bg-card text-text-secondary'
            }`}
          >
            {u}
          </button>
        ))}
      </div>

      <button
        onClick={handleFinish}
        className="w-full py-4 rounded-2xl bg-accent-blue text-text-primary font-semibold text-lg mt-auto mb-8 active:opacity-80"
      >
        Start Tracking
      </button>
    </div>
  );
}
