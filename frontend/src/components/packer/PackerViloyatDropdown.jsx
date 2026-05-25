import React, { useMemo } from 'react';
import { PACKER_UZ_VILOYATLAR } from '../../constants/uzViloyatlarPacker';
import StaffChipDropdown from '../staff/StaffChipDropdown';

/** Packer topbar viloyat filteri — StaffChipDropdown wrapper. */
export default function PackerViloyatDropdown({ value, onChange, className = '', title }) {
  const options = useMemo(
    () => PACKER_UZ_VILOYATLAR.map((r) => ({ value: r.id, label: r.name })),
    [],
  );

  return (
    <StaffChipDropdown
      value={value}
      onChange={onChange}
      options={options}
      emptyValue=""
      emptyLabel="Barcha viloyatlar"
      title={title ?? 'Asosiy navbat: yetkazish manziliga qarab'}
      className={className}
      instanceId="packer-viloyat"
    />
  );
}
