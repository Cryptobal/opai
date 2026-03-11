interface AuthFormHeaderProps {
  title: string;
  subtitle: string;
}

export function AuthFormHeader({ title, subtitle }: AuthFormHeaderProps) {
  return (
    <div className="text-center mb-7">
      <h2
        className="text-xl font-bold text-[#f9fafb] mb-1.5"
        style={{ letterSpacing: "-0.02em", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      >
        {title}
      </h2>
      <p className="text-[13px] text-[#6b7280] m-0" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        {subtitle}
      </p>
    </div>
  );
}
