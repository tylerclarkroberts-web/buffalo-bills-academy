// First-class /elhalo page, used by the lobby card. Same room as the Hall of Doors, but Exit goes home.
import React, { useEffect, useState } from 'react';
import { navigate } from '../../App.jsx';
import '../mines.css';
import ElHaloRoom from './ElHaloRoom.jsx';

export default function ElHaloPage() {
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => setElapsedMs(Date.now() - t0), 250);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="mines" data-test="elhalo-page">
      <ElHaloRoom
        elapsedMs={elapsedMs}
        onExit={() => navigate('/')}
        exitLabel="◄ BACK TO THE LOBBY"
        showShift={false}
      />
    </div>
  );
}
