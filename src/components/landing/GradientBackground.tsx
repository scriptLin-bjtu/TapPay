export default function GradientBackground() {
  return (
    <div className="gradient-bg" aria-hidden="true">
      <div className="gradient-orb-drift gradient-orb-drift-1">
        <div className="gradient-orb gradient-orb-blue" />
      </div>
      <div className="gradient-orb-drift gradient-orb-drift-2">
        <div className="gradient-orb gradient-orb-cyan" />
      </div>
      <div className="gradient-orb-drift gradient-orb-drift-3">
        <div className="gradient-orb gradient-orb-accent" />
      </div>
    </div>
  );
}
