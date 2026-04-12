interface Props {
  value: number; // timestamp
  onChange: (ts: number) => void;
}

export default function DateTimeInput({ value, onChange }: Props) {
  const d = new Date(value);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  return (
    <div className="mb-4">
      <label className="text-text-secondary text-sm mb-1 block">Date & time</label>
      <input
        type="datetime-local"
        value={local}
        onChange={e => {
          const parsed = new Date(e.target.value).getTime();
          if (!isNaN(parsed)) onChange(parsed);
        }}
        className="w-full px-4 py-3 rounded-xl bg-bg-input text-text-primary text-base outline-none focus:ring-2 focus:ring-accent-blue"
      />
    </div>
  );
}
