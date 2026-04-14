import { useState } from 'react';
import { v4 as uuid } from 'uuid';
import { useApp } from '../context/AppContext';
import { useSync } from '../context/SyncContext';
import { db } from '../db';
import { getEnvironment } from '../sync';
import { exportPDF, exportCSV } from '../export';
import type { BabyProfile } from '../types';
import Modal from './Modal';

const PRESET_COLORS = [
  '#4A9EFF', '#34D058', '#F0B429', '#F85149',
  '#B180F7', '#F778BA', '#56D4DD', '#E09B54',
];

const REMINDER_OPTIONS = [
  { label: '2h', value: 120 },
  { label: '2.5h', value: 150 },
  { label: '3h', value: 180 },
];

export default function SettingsScreen() {
  const { state, dispatch, activeBaby } = useApp();
  const { sync, createRoom, joinRoom, leaveRoom } = useSync();
  const [editingBaby, setEditingBaby] = useState<BabyProfile | null>(null);
  const [addingBaby, setAddingBaby] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  // Edit fields
  const [editName, setEditName] = useState('');
  const [editDob, setEditDob] = useState('');
  const [editGender, setEditGender] = useState<'male' | 'female' | 'other'>('male');
  const [editColor, setEditColor] = useState(PRESET_COLORS[0]);
  const [editUnit, setEditUnit] = useState<'oz' | 'mL'>('oz');
  const [editReminder, setEditReminder] = useState(180);

  function openEdit(baby: BabyProfile) {
    setEditName(baby.name);
    setEditDob(baby.dob);
    setEditGender(baby.gender);
    setEditColor(baby.themeColor);
    setEditUnit(baby.unitPreference);
    setEditReminder(baby.reminderIntervalMinutes);
    setEditingBaby(baby);
  }

  function openAdd() {
    setEditName('');
    setEditDob(new Date().toISOString().split('T')[0]);
    setEditGender('male');
    setEditColor(PRESET_COLORS[0]);
    setEditUnit('oz');
    setEditReminder(180);
    setAddingBaby(true);
  }

  async function handleSaveEdit() {
    if (!editingBaby) return;
    const updated: BabyProfile = {
      ...editingBaby,
      name: editName.trim() || editingBaby.name,
      dob: editDob,
      gender: editGender,
      themeColor: editColor,
      unitPreference: editUnit,
      reminderIntervalMinutes: editReminder,
    };
    await db.babies.put(updated);
    dispatch({ type: 'UPDATE_BABY', baby: updated });
    setEditingBaby(null);
  }

  async function handleAddBaby() {
    const baby: BabyProfile = {
      id: uuid(),
      name: editName.trim() || 'Baby',
      dob: editDob,
      gender: editGender,
      themeColor: editColor,
      unitPreference: editUnit,
      reminderIntervalMinutes: editReminder,
      createdAt: Date.now(),
    };
    await db.babies.add(baby);
    dispatch({ type: 'ADD_BABY', baby });
    setAddingBaby(false);
  }

  async function handleDeleteBaby(id: string) {
    await db.babies.delete(id);
    await db.feeds.where('babyId').equals(id).delete();
    await db.diapers.where('babyId').equals(id).delete();
    await db.pumps.where('babyId').equals(id).delete();
    dispatch({ type: 'DELETE_BABY', id });
    setConfirmDelete(null);
  }

  async function handleJoinRoom() {
    if (joinCode.length !== 6) return;
    setJoining(true);
    setJoinError('');
    const success = await joinRoom(joinCode);
    if (!success) {
      setJoinError('Room not found.');
    }
    setJoining(false);
  }

  return (
    <div className="flex-1 scrollable px-4 pt-4 pb-4">
      <h2 className="text-lg font-semibold mb-5">Settings</h2>

      {/* Baby profiles */}
      <SectionLabel>Baby Profiles</SectionLabel>
      <div className="flex flex-col gap-2 mb-5">
        {state.babies.map(baby => (
          <div
            key={baby.id}
            className={`glass-card rounded-2xl p-4 flex items-center gap-3 transition-all ${
              baby.id === state.activeBabyId ? 'ring-1 ring-accent-blue/40' : ''
            }`}
          >
            <button
              onClick={() => dispatch({ type: 'SET_ACTIVE_BABY', id: baby.id })}
              className="flex items-center gap-3 flex-1 min-h-[48px]"
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0"
                style={{ backgroundColor: baby.themeColor + '20', color: baby.themeColor }}
              >
                {baby.name.charAt(0).toUpperCase()}
              </div>
              <div className="text-left">
                <p className="font-medium text-[15px]">{baby.name}</p>
                <p className="text-xs text-text-muted">Born {baby.dob}</p>
              </div>
            </button>
            <button
              onClick={() => openEdit(baby)}
              className="px-3 py-2 text-xs rounded-xl bg-bg-input text-text-secondary min-h-[36px] font-medium active:opacity-70"
            >
              Edit
            </button>
          </div>
        ))}
        <button
          onClick={openAdd}
          className="w-full py-3 rounded-2xl border border-dashed border-border-light text-text-muted text-sm min-h-[48px] font-medium active:opacity-70"
        >
          + Add Baby
        </button>
      </div>

      {/* Active baby settings */}
      {activeBaby && (
        <>
          <SectionLabel>Preferences</SectionLabel>
          <div className="glass-card rounded-2xl divide-y divide-border mb-5">
            <SettingsRow label="Unit preference" value={activeBaby.unitPreference} />
            <SettingsRow
              label="Feed reminder"
              value={`Every ${(activeBaby.reminderIntervalMinutes / 60).toFixed(1).replace('.0', '')} hours`}
            />
          </div>

          <SectionLabel>Sync</SectionLabel>
          <div className="glass-card rounded-2xl p-4 mb-5">
            {sync.connected ? (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-accent-green shadow-[0_0_8px_rgba(52,208,88,0.4)]" />
                  <span className="text-sm text-accent-green font-medium">Connected</span>
                </div>
                <p className="text-xs text-text-muted mb-1">Room code</p>
                <p className="text-2xl font-bold tracking-[0.3em] mb-3 tabular-nums">{sync.roomCode}</p>
                <p className="text-xs text-text-muted mb-4">Share this code with your partner so they can join and see all your data.</p>
                <button
                  onClick={leaveRoom}
                  className="w-full py-2.5 rounded-xl text-sm text-accent-red bg-accent-red/10 font-medium active:opacity-70"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div>
                <p className="text-sm text-text-secondary mb-4">Sync feeds, diapers, and pumps with your partner in real-time.</p>
                <button
                  onClick={async () => { await createRoom(); }}
                  className="w-full py-3 rounded-xl btn-primary text-white font-medium text-sm mb-3"
                >
                  Create Room
                </button>
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-text-muted">or join existing</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={joinCode}
                    onChange={e => { setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setJoinError(''); }}
                    placeholder="000000"
                    maxLength={6}
                    className="flex-1 px-3 py-3 rounded-xl bg-bg-input text-text-primary text-sm outline-none text-center tracking-[0.3em] font-bold focus:ring-2 focus:ring-accent-blue"
                  />
                  <button
                    onClick={handleJoinRoom}
                    disabled={joinCode.length !== 6 || joining}
                    className="px-5 py-3 rounded-xl btn-success text-white text-sm font-medium disabled:opacity-40"
                  >
                    {joining ? (
                      <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : 'Join'}
                  </button>
                </div>
                {joinError && (
                  <p className="text-xs text-accent-red mt-2">{joinError}</p>
                )}
              </div>
            )}
          </div>

          <SectionLabel>Data</SectionLabel>
          <div className="glass-card rounded-2xl divide-y divide-border mb-5">
            <button
              onClick={() => activeBaby && exportPDF(activeBaby)}
              className="flex items-center justify-between px-4 py-3.5 min-h-[48px] w-full active:bg-bg-card-hover transition-colors"
            >
              <span className="text-sm font-medium">Export PDF</span>
              <span className="text-sm text-accent-blue font-medium">Download</span>
            </button>
            <button
              onClick={() => activeBaby && exportCSV(activeBaby)}
              className="flex items-center justify-between px-4 py-3.5 min-h-[48px] w-full active:bg-bg-card-hover transition-colors"
            >
              <span className="text-sm font-medium">Export CSV</span>
              <span className="text-sm text-accent-blue font-medium">Download</span>
            </button>
          </div>
        </>
      )}

      <SectionLabel>App</SectionLabel>
      <div className="glass-card rounded-2xl divide-y divide-border mb-5">
        <button
          onClick={async () => {
            if ('serviceWorker' in navigator) {
              const reg = await navigator.serviceWorker.getRegistration();
              if (reg) {
                await reg.update();
                if (reg.waiting) {
                  reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                  window.location.reload();
                } else {
                  // Force reload to bust any stale cache
                  window.location.reload();
                }
              } else {
                window.location.reload();
              }
            } else {
              window.location.reload();
            }
          }}
          className="flex items-center justify-between px-4 py-3.5 min-h-[48px] w-full active:bg-bg-card-hover transition-colors"
        >
          <span className="text-sm font-medium">Check for Updates</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4A9EFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
          </svg>
        </button>
        <button
          onClick={() => {
            if ('caches' in window) {
              caches.keys().then(names => {
                names.forEach(name => caches.delete(name));
              });
            }
            window.location.reload();
          }}
          className="flex items-center justify-between px-4 py-3.5 min-h-[48px] w-full active:bg-bg-card-hover transition-colors"
        >
          <span className="text-sm font-medium">Force Refresh</span>
          <span className="text-xs text-text-muted">Clear cache</span>
        </button>
      </div>

      <div className="mt-4 text-center pb-4">
        <p className="text-text-muted text-xs">Lactation consultant: 954-844-9908</p>
        <p className="text-text-muted text-xs mt-1 opacity-60">
          BabyLog v1.3
          {getEnvironment() === 'development' && (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-accent-amber/20 text-accent-amber font-semibold">DEV</span>
          )}
        </p>
      </div>

      {/* Edit/Add Modal */}
      <Modal
        open={editingBaby !== null || addingBaby}
        onClose={() => { setEditingBaby(null); setAddingBaby(false); }}
        title={editingBaby ? 'Edit Baby' : 'Add Baby'}
      >
        <label className="text-text-muted text-xs font-medium uppercase tracking-wider mb-1.5 block">Name</label>
        <input
          type="text"
          value={editName}
          onChange={e => setEditName(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-bg-input text-text-primary text-base mb-4 outline-none focus:ring-2 focus:ring-accent-blue"
        />

        <label className="text-text-muted text-xs font-medium uppercase tracking-wider mb-1.5 block">Date of birth</label>
        <input
          type="date"
          value={editDob}
          onChange={e => setEditDob(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-bg-input text-text-primary text-base mb-4 outline-none focus:ring-2 focus:ring-accent-blue"
        />

        <label className="text-text-muted text-xs font-medium uppercase tracking-wider mb-1.5 block">Gender</label>
        <div className="flex gap-2 mb-4">
          {(['male', 'female', 'other'] as const).map(g => (
            <button
              key={g}
              onClick={() => setEditGender(g)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium capitalize transition-colors ${
                editGender === g ? 'bg-accent-blue text-white' : 'bg-bg-card text-text-secondary'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        <label className="text-text-muted text-xs font-medium uppercase tracking-wider mb-1.5 block">Theme color</label>
        <div className="flex gap-2.5 mb-4 flex-wrap">
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setEditColor(c)}
              className="w-9 h-9 rounded-full border-2 transition-all"
              style={{
                backgroundColor: c,
                borderColor: editColor === c ? '#E8ECF1' : 'transparent',
                transform: editColor === c ? 'scale(1.1)' : 'scale(1)',
                boxShadow: editColor === c ? `0 0 12px ${c}40` : 'none',
              }}
            />
          ))}
        </div>

        <label className="text-text-muted text-xs font-medium uppercase tracking-wider mb-1.5 block">Unit preference</label>
        <div className="flex gap-2 mb-4">
          {(['oz', 'mL'] as const).map(u => (
            <button
              key={u}
              onClick={() => setEditUnit(u)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                editUnit === u ? 'bg-accent-blue text-white' : 'bg-bg-card text-text-secondary'
              }`}
            >
              {u}
            </button>
          ))}
        </div>

        <label className="text-text-muted text-xs font-medium uppercase tracking-wider mb-1.5 block">Feed reminder</label>
        <div className="flex gap-2 mb-5">
          {REMINDER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setEditReminder(opt.value)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                editReminder === opt.value ? 'bg-accent-blue text-white' : 'bg-bg-card text-text-secondary'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
          onClick={editingBaby ? handleSaveEdit : handleAddBaby}
          className="w-full py-4 rounded-2xl btn-success text-white font-semibold text-lg mb-2"
        >
          {editingBaby ? 'Save Changes' : 'Add Baby'}
        </button>

        {editingBaby && state.babies.length > 1 && (
          confirmDelete === editingBaby.id ? (
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-3 rounded-xl bg-bg-card text-text-secondary text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteBaby(editingBaby.id)}
                className="flex-1 py-3 rounded-xl bg-accent-red text-white text-sm font-medium"
              >
                Confirm Delete
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(editingBaby.id)}
              className="w-full py-3 rounded-xl text-accent-red text-sm font-medium"
            >
              Delete {editingBaby.name}
            </button>
          )
        )}
      </Modal>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs text-text-muted font-medium uppercase tracking-wider mb-2.5">{children}</h3>;
}

function SettingsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5 min-h-[48px]">
      <span className="text-sm font-medium">{label}</span>
      <span className="text-sm text-text-secondary">{value}</span>
    </div>
  );
}
