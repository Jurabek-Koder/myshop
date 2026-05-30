import React from 'react';

export default function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="ap-page-header">
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="ap-page-header-actions ap-scroll-x">{actions}</div> : null}
    </div>
  );
}
