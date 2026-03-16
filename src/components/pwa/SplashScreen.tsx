/**
 * SplashScreen — shown while session is being verified.
 * Prevents the flash of the login screen on PWA open.
 * Dark background (#0f172a) with OPAI logo (red bolt) + subtle spinner.
 */
export function SplashScreen() {
  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center"
      style={{ background: "#0f172a" }}
    >
      {/* OPAI logo bolt */}
      <div
        className="w-[56px] h-[56px] rounded-[16px] flex items-center justify-center mb-5"
        style={{
          background: "linear-gradient(135deg, #f43f5e, #e11d48, #be123c)",
          boxShadow: "0 0 40px rgba(244,63,94,0.2)",
        }}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      </div>

      {/* Spinner */}
      <div
        className="w-6 h-6 border-2 border-white/10 border-t-white/40 rounded-full animate-spin"
      />
    </div>
  );
}
