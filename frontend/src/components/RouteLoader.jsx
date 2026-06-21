import React from 'react';

/** Marshrut chunklari yuklanguncha — boshlang‘ich splash bilan bir xil: faqat sariq MyShop */
export default function RouteLoader() {
  return (
    <div className="route-loader route-loader--brand" role="status" aria-live="polite" aria-label="MyShop">
      <span className="route-loader-brand">MyShop</span>
    </div>
  );
}
