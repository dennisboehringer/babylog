import { useState } from 'react';
import { v4 as uuid } from 'uuid';
import { useApp } from '../context/AppContext';
import { useSync } from '../context/SyncContext';
import { db } from '../db';
import { exportPDF, exportCSV } from '../export';
import type { BabyProfile } from '../types';
import Modal from './Modal';

const PRESET_COLORS = [
  '#388BFD', '#2EA043', '#D29922', '#DA3633',
  '#A371F7', '#F778BA', '#56D4DD', '#E09B54',
];

const REMINDER_OPTIONS = [
  { label: 'Every 2 hours', value: 120 },
  { label: 'Every 2.5 hours', value: 150 },
  { label: 'Every 3 hours', value: 180 },
];

export default function SettingsScreen() {
  const { state, dispatch, activeBaby } = useApp();
  const { sync, createRoom, joinRoom, leaveRoom } = useSync();
  const [editingBaby, setEditingBaby] = useState<BabyProfile | null>(null);
  const [addingBaby, setAddingBaby] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [_showShareModal, setShowShareModal] = useState(false);

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

  return (
    <div className="flex-1 scrollable px-4 pt-4 pb-4">
      <h2 className="text-lg font-semibold mb-4">Settings</h2>

      {/* Baby profiles */}
      <h3 className="text-sm text-text-secondary font-medium mb-2">Baby Profiles</h3>
      <div className="flex flex-col gap-2 mb-4">
        {state.babies.map(baby => (
          <div
            key={baby.id}
            className={`bg-bg-card rounded-2xl p-4 flex items-center gap-3 ${
              baby.id === state.activeBabyId ? 'ring-2 ring-accent-blue' : ''
            }`}
          >
            <button
              onClick={() => dispatch({ type: 'SET_ACTIVE_BABY', id: baby.id })}
              className="flex items-center gap-3 flex-1 min-h-[48px]"
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0"
                style={{ backgroundColor: baby.themeColor + '33', color: baby.themeColor }}
              >
                {baby.name.charAt(0).toUpperCase()}
              </div>
              <div className="text-left">
                <p className="font-medium">{baby.name}</p>
                <p className="text-xs text-text-secondary">Born {baby.dob}</p>
              </div>
            </button>
            <button
              onClick={() => openEdit(baby)}
              className="px-3 py-2 text-xs rounded-lg bg-bg-input text-text-secondary min-h-[36px]"
            >
              Edit
            </button>
          </div>
        ))}
        <button
          onClick={openAdd}
          className="w-full py-3 rounded-2xl border-2 border-dashed border-border text-text-secondary text-sm min-h-[48px]"
        >
          + Add Baby
        </button>
      </div>

      {/* Active baby settings */}
      {activeBaby && (
        <>
          <h3 className="text-sm text-text-secondary font-medium mb-2">Preferences</h3>
          <div className="bg-bg-card rounded-2xl divide-y divide-border mb-4">
            <SettingsRow label="Unit preference" value={activeBaby.unitPreference} />
            <SettingsRow
              label="Feed reminder"
              value={`Every ${(activeBaby.reminderIntervalMinutes / 60).toFixed(1).replace('.0', '')} hours`}
            />
          </div>

          <h3 className="text-sm text-text-secondary font-medium mb-2">Sync</h3>
          <div className="bg-bg-card rounded-2xl p-4 mb-4">
            {sync.connected ? (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-accent-green" />
                  <span className="text-sm text-accent-green">Connected</span>
                </div>
                <p className="text-sm text-text-secondary mb-1">Room code:</p>
                <p className="text-2xl font-bold tracking-widest mb-3">{sync.roomCode}</p>
                <p className="text-xs text-text-muted mb-3">Share this code with your partner so they can join.</p>
                <button
                  onClick={leaveRoom}
                  className="w-full py-2.5 rounded-xl text-sm text-accent-red bg-accent-red/10"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div>
                <p className="text-sm text-text-secondary mb-3">Sync data with your partner in real-time.</p>
                <button
                  onClick={async () => {
                    await createRoom();
                    setShowShareModal(true);
                  }}
                  className="w-full py-3 rounded-xl bg-accent-blue text-white font-medium text-sm mb-2"
                >
                  Create Room
                </button>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter 6-digit code"
                    maxLength={6}
                    className="flex-1 px-3 py-3 rounded-xl bg-bg-input text-text-primary text-sm outline-none text-center tracking-widest"
                  />
                  <button
                    onClick={() => { if (joinCode.length === 6) joinRoom(joinCode); }}
                    disabled={joinCode.length !== 6}
                    className="px-4 py-3 rounded-xl bg-accent-green text-white text-sm font-medium disabled:opacity-40"
                  >
                    Join
                  </button>
                </div>
              </div>
            )}
          </div>

          <h3 className="text-sm text-text-secondary font-medium mb-2">Data</h3>
          <div className="bg-bg-card rounded-2xl divide-y divide-border mb-4">
            <button
              onClick={() => activeBaby && exportPDF(activeBaby)}
              className="flex items-center justify-between px-4 py-3.5 min-h-[48px] w-full"
            >
              <span className="text-sm">Export PDF</span>
              <span className="text-sm text-accent-blue">Download</span>
            </button>
            <button
              onClick={() => activeBaby && exportCSV(activeBaby)}
              className="flex items-center justify-between px-4 py-3.5 min-h-[48px] w-full"
            >
              <span className="text-sm">Export CSV</span>
              <span className="text-sm text-accent-blue">Download</span>
            </button>
          </div>
        </>
      )}

      <div className="mt-4 text-center">
        <p className="text-text-muted text-xs">Lactation consultant: 954-844-9908</p>
        <p className="text-text-muted text-xs mt-1">BabyLog v1.0</p>
      </div>

      {/* Edit/Add Modal */}
      <Modal
        open={editingBaby !== null || addingBaby}
        onClose={() => { setEditingBaby(null); setAddingBaby(false); }}
        title={editingBaby ? 'Edit Baby' : 'Add Baby'}
      >
        <label className="text-text-secondary text-sm mb-1 block">Name</label>
        <input
          type="text"
          value={editName}
          onChange={e => setEditName(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-bg-input text-text-primary text-base mb-3 outline-none focus:ring-2 focus:ring-accent-blue"
        />

        <label className="text-text-secondary text-sm mb-1 block">Date of birth</label>
        <input
          type="date"
          value={editDob}
          onChange={e => setEditDob(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-bg-input text-text-primary text-base mb-3 outline-none focus:ring-2 focus:ring-accent-blue"
        />

        <label className="text-text-secondary text-sm mb-1 block">Gender</label>
        <div className="flex gap-2 mb-3">
          {(['male', 'female', 'other'] as const).map(g => (
            <button
              key={g}
              onClick={() => setEditGender(g)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium capitalize ${
                editGender === g ? 'bg-accent-blue text-white' : 'bg-bg-card text-text-secondary'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        <label className="text-text-secondary text-sm mb-1 block">Theme color</label>
        <div className="flex gap-2 mb-3 flex-wrap">
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setEditColor(c)}
              className="w-8 h-8 rounded-full border-2"
              style={{
                backgroundColor: c,
                borderColor: editColor === c ? '#E1E4E8' : 'transparent',
              }}
            />
          ))}
        </div>

        <label className="text-text-secondary text-sm mb-1 block">Unit preference</label>
        <div className="flex gap-2 mb-3">
          {(['oz', 'mL'] as const).map(u => (
            <button
              key={u}
              onClick={() => setEditUnit(u)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${
                editUnit === u ? 'bg-accent-blue text-white' : 'bg-bg-card text-text-secondary'
              }`}
            >
              {u}
            </button>
          ))}
        </div>

        <label className="text-text-secondary text-sm mb-1 block">Feed reminder</label>
        <div className="flex gap-2 mb-4">
          {REMINDER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setEditReminder(opt.value)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-medium ${
                editReminder === opt.value ? 'bg-accent-blue text-white' : 'bg-bg-card text-text-secondary'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
          onClick={editingBaby ? handleSaveEdit : handleAddBaby}
          className="w-full py-4 rounded-2xl bg-accent-green text-white font-semibold text-lg mb-2 active:opacity-80"
        >
          {editingBaby ? 'Save Changes' : 'Add Baby'}
        </button>

        {editingBaby && state.babies.length > 1 && (
          confirmDelete === editingBaby.id ? (
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-3 rounded-xl bg-bg-card text-text-secondary text-sm"
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
              className="w-full py-3 rounded-xl text-accent-red text-sm"
            >
              Delete {editingBaby.name}
            </button>
          )
        )}
      </Modal>
    </div>
  );
}

function SettingsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5 min-h-[48px]">
      <span className="text-sm">{label}</span>
      <span className="text-sm text-text-secondary">{value}</span>
    </div>
  );
}
