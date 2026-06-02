import React, { Suspense, useEffect, useState } from 'react';
import RouteLoader from '../components/RouteLoader.jsx';

let staffStylesPromise = null;

function loadStaffPanelStyles() {
  if (!staffStylesPromise) {
    staffStylesPromise = import('./staffPanelStyles.js');
  }
  return staffStylesPromise;
}

/** Rollik panellar: avval staff CSS, keyin lazy dashboard chunk. */
export default function SuspensePanel({ children }) {
  const [stylesReady, setStylesReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadStaffPanelStyles()
      .then(() => {
        if (!cancelled) setStylesReady(true);
      })
      .catch(() => {
        if (!cancelled) setStylesReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!stylesReady) {
    return (
      <div className="container" style={{ padding: '2rem 1rem', maxWidth: 480, margin: '0 auto' }}>
        <RouteLoader />
      </div>
    );
  }

  return <Suspense fallback={<RouteLoader />}>{children}</Suspense>;
}
