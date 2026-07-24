import { useEffect, useMemo, useState } from "react";

interface Props {
  initialOn?: boolean;
}

export default function SecurityLens({ initialOn = false }: Props) {
  const [on, setOn] = useState(initialOn);

  useEffect(() => {
    document.body.classList.toggle("sec-on", on);
  }, [on]);

  const label = useMemo(
    () => (on ? "Security highlight on" : "Security highlight off"),
    [on],
  );

  return (
    <button
      type="button"
      className={`lens${on ? " on" : ""}`}
      aria-pressed={on}
      aria-label={label}
      onClick={() => setOn((v) => !v)}
    >
      <span className="sw" aria-hidden="true" />
      Security
    </button>
  );
}
