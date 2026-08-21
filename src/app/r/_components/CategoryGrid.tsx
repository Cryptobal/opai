"use client";

type Category = {
  id: string;
  label: string;
  description: string;
  emergency?: boolean;
};

export function CategoryGrid(props: {
  categories: Category[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10,
      }}
    >
      {props.categories.map((c) => {
        const selected = props.value === c.id;
        const emergency = Boolean(c.emergency);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => props.onChange(c.id)}
            style={{
              minHeight: 72,
              textAlign: "left",
              padding: 12,
              borderRadius: "var(--rp-radius)",
              border: `1.5px solid ${
                selected
                  ? emergency
                    ? "var(--rp-warn)"
                    : "var(--rp-brand)"
                  : "var(--rp-line)"
              }`,
              background: selected
                ? emergency
                  ? "#fff7ed"
                  : "var(--rp-tint)"
                : "var(--rp-card)",
              color: "var(--rp-ink)",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 14 }}>{c.label}</div>
            <div style={{ fontSize: 12, color: "#5b675f", marginTop: 4, lineHeight: 1.3 }}>
              {c.description}
            </div>
          </button>
        );
      })}
    </div>
  );
}
